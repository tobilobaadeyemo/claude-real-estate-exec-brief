import { addDays, ngn, niceWithin, parseDate, priceStep, roundTo, safeCeil } from "./format.js";
import {
  adjustComps,
  confidence,
  heatScore,
  priceBand,
  type Comp,
  type CompSet,
  type Confidence,
  type Heat,
  type HeatInputs,
  type PriceBand,
} from "./market.js";

export type Audience = "leadership" | "client" | "team";
export type Segment = "local" | "diaspora" | "investor" | "corporate" | "developer";
export type View = Audience | "preview";

/** A flag shown in the brief, scoped to the versions allowed to see it. */
export interface Flag {
  text: string;
  show: View[];
}

const ALL: View[] = ["preview", "leadership", "client", "team"];
const PAID: View[] = ["leadership", "client", "team"];
const WITH_FLOOR: View[] = ["leadership", "client"];
const LEADERSHIP: View[] = ["leadership"];

export function flagsFor(flags: Flag[], view: View): string[] {
  return flags.filter((f) => f.show.includes(view)).map((f) => f.text);
}

export const SEGMENT_SHORT: Record<Segment, string> = {
  local: "Local",
  diaspora: "Diaspora",
  investor: "Investor",
  corporate: "Corporate",
  developer: "Developer",
};

export const SEGMENT_NAMES: Record<Segment, string> = {
  local: "Lagos senior professionals and business owners",
  diaspora: "Diaspora families",
  investor: "Investors (buy to let)",
  corporate: "Corporates and expatriates",
  developer: "Developers and land bankers",
};

export interface FunnelRates {
  inquiry_to_qualified: number;
  qualified_to_viewing: number;
  viewing_to_offer: number;
  offer_to_close: number;
}

export interface TrackRecord {
  at_market_close_vs_list_pct: number;
  at_market_dom?: number;
  at_market_n?: number;
  above_market_close_vs_list_pct?: number;
  above_market_dom?: number;
  above_market_n?: number;
}

export interface StrategyInput {
  listing: {
    id: string;
    district: string;
    type: string;
    bedrooms?: number;
    plot_sqm?: number;
    built_sqm?: number;
    title: string;
    condition?: string;
    amenities?: string[];
    asking_price_ngn: number;
    floor_price_ngn?: number;
  };
  transaction: "sale" | "lease";
  comps: Comp[];
  list_to_close_discount_pct?: number;
  track_record?: TrackRecord;
  heat?: HeatInputs;
  fx_ngn_per_usd?: number;
  segment_mix_pct?: Partial<Record<Segment, number>>;
  funnel_rates?: FunnelRates;
  cost_per_qualified_lead_ngn?: number;
  production_cost_ngn?: number;
  events_cost_ngn?: number;
  commission_rate_pct?: number;
  budget_cap_ngn?: number;
  launch_date: string;
  target_close_days?: number;
  lease_fallback_rent_ngn_per_year?: number;
  presenter?: string;
}

export const DEFAULT_FUNNEL: FunnelRates = {
  inquiry_to_qualified: 0.25,
  qualified_to_viewing: 0.35,
  viewing_to_offer: 0.15,
  offer_to_close: 0.5,
};

/**
 * List-price windows by market heat (references/marketing-strategy.md section 1), as
 * [low, target, high] multiples of the adjusted median. Unknown heat uses Warm.
 */
const PRICE_WINDOW: Record<Heat["label"], [number, number, number]> = {
  Hot: [1.0001, 1.04, 1.05],
  Warm: [0.98, 1.015, 1.02],
  Cold: [0.97, 1.0, 1.0],
  Unknown: [0.98, 1.015, 1.02],
};
/** One decisive price step of 3 to 5%, aiming at 3.5%. */
const STEP_WINDOW: [number, number, number] = [0.95, 0.965, 0.97];
const BUDGET_GUARDRAIL = 0.25;

/** Default split of variable spend and inquiry targets; replace with CRM history where available. */
const CHANNELS = [
  { key: "portals", name: "Portals (NPC, PropertyPro), premium placement", role: "Capture", spend: 0.23, inquiries: 0.375 },
  { key: "meta", name: "Meta: Reels plus click-to-WhatsApp ads", role: "Create", spend: 0.58, inquiries: 0.34375 },
  { key: "google", name: "Google Search, exact-match district queries", role: "Capture", spend: 0.19, inquiries: 0.09375 },
  { key: "agents", name: "Agent co-broke network", role: "Reach", spend: 0, inquiries: 0.125 },
  { key: "crm", name: "WhatsApp broadcast and email to opted-in CRM contacts", role: "Convert", spend: 0, inquiries: 0.0625 },
] as const;

export interface ChannelLine {
  name: string;
  role: string;
  segments: string;
  budget: number;
  inquiries: number;
}

export interface Gate {
  day: number;
  date: Date;
  name: "Traffic" | "Price" | "Strategy";
  threshold: string;
  action: string;
  /** Wording for the team version, which must not reveal the floor. */
  teamAction: string;
}

export interface CumulativeTarget {
  day: number;
  date: Date;
  inquiries: number;
  qualified: number;
  viewings: number;
  offers: number;
}

export interface StrategyPlan {
  input: StrategyInput;
  compSet: CompSet;
  premium: number;
  band: PriceBand;
  perSqm?: { basis: "plot" | "built"; subject: number; market: number; marketMin: number; marketMax: number };
  heat: Heat;
  confidence: Confidence;
  pricing: {
    list: number;
    listPremium: number;
    floor: number;
    floorBasis: "owner" | "adjusted comp low";
    floorAboveMarket: boolean;
    /** True when the owner's floor forced the list price up to it. */
    listAtFloor: boolean;
    step: number;
    stepAvailable: boolean;
    stepHitFloor: boolean;
    keepAsk: boolean;
    /** Price just below the search band edge, when keeping the ask leaves it just above one. */
    bandSuggestion?: number;
  };
  outcomes: {
    expectedClose: number;
    expectedCloseBasis: string;
    atAsk?: { close: number; dom?: number };
    atList?: { close: number; dom?: number };
  };
  segments: { primary?: Segment; secondary?: Segment; known: boolean; mix: Partial<Record<Segment, number>> };
  funnel: { rates: FunnelRates; ratesAssumed: boolean; inquiries: number; qualified: number; viewings: number; offers: number; closes: number };
  budget: {
    variable?: number;
    production?: number;
    events?: number;
    contingency?: number;
    /** Full total; undefined while any line is missing. */
    total?: number;
    /** Sum of the known lines when the total is incomplete. */
    partialTotal?: number;
    missing: string[];
    fee?: number;
    feeRatio?: number;
    overGuardrail: boolean;
    overCap: boolean;
  };
  channels: ChannelLine[];
  timeline: {
    launch: Date;
    closeDays: number;
    closeDate: Date;
    gates: Gate[];
    cumulative: CumulativeTarget[];
    trafficMinQualified: number;
    priceGateViewings: number;
    decemberWindow?: { from: Date; to: Date };
  };
  flags: Flag[];
}

/** If a price sits just above a round search band edge (₦602M), drop it just below (₦595M). */
export function bandAdjust(price: number): number {
  const unit = 10 ** Math.floor(Math.log10(price));
  const edge = Math.floor(price / unit) * unit;
  if (price > edge && price <= edge * 1.02) return edge - priceStep(edge * 0.999);
  return price;
}

function decemberWindow(launch: Date, close: Date): { from: Date; to: Date } | undefined {
  for (let year = launch.getUTCFullYear() - 1; year <= close.getUTCFullYear(); year++) {
    const from = new Date(Date.UTC(year, 11, 15));
    const to = new Date(Date.UTC(year + 1, 0, 5));
    if (from <= close && to >= launch) return { from, to };
  }
  return undefined;
}

/** Split an amount across weights on a round unit; lines are non-negative and sum exactly to the amount. */
function allocate(amount: number, weights: number[], unit: number): number[] {
  const units = Math.floor(amount / unit);
  const raw = weights.map((w) => (units * w) / weights.reduce((a, b) => a + b, 0));
  const lines = raw.map((r) => Math.floor(r));
  let left = units - lines.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; left > 0; k++, left--) lines[order[k % order.length].i] += 1;
  const result = lines.map((l) => l * unit);
  const residual = amount - result.reduce((a, b) => a + b, 0);
  const largest = result.indexOf(Math.max(...result));
  result[largest] += residual;
  return result;
}

function sizeOf(listing: StrategyInput["listing"]): { basis: "plot" | "built"; sqm: number } | undefined {
  if (listing.plot_sqm) return { basis: "plot", sqm: listing.plot_sqm };
  if (listing.built_sqm) return { basis: "built", sqm: listing.built_sqm };
  return undefined;
}

export function buildStrategy(input: StrategyInput): StrategyPlan {
  const flags: Flag[] = [];
  const { listing } = input;
  const lease = input.transaction === "lease";
  const money = (v: number) => (lease ? `${ngn(v)}/yr` : ngn(v));
  const compSet = adjustComps(input.comps, input.list_to_close_discount_pct);
  if (compSet.discountMissing) {
    flags.push({ text: "Asking comps used without an asking-to-close discount: closed prices typically sit below asking; magnitude unknown [DATA NEEDED: list vs close pairs].", show: ALL });
  }
  const premium = listing.asking_price_ngn / compSet.median - 1;
  const band = priceBand(premium);
  const heat = heatScore(input.heat);
  if (heat.label === "Unknown") flags.push({ text: "No market heat signals supplied; pricing uses the Warm default [DATA NEEDED: heat inputs].", show: ALL });
  else if (heat.missing.length) flags.push({ text: `Heat score uses ${heat.signals.length} of 5 signals; not scored: ${heat.missing.join("; ")}.`, show: ALL });

  const size = sizeOf(listing);
  const missingInputs: string[] = [];
  if (!size) {
    missingInputs.push("plot or built size");
    flags.push({ text: "No plot or built size supplied: price per sqm is not shown [DATA NEEDED: plot sqm].", show: ALL });
  }
  const conf = confidence(compSet, missingInputs);
  const perSqm = size
    ? { basis: size.basis, subject: listing.asking_price_ngn / size.sqm, market: compSet.median / size.sqm, marketMin: compSet.min / size.sqm, marketMax: compSet.max / size.sqm }
    : undefined;

  // Pricing plan: references/marketing-strategy.md section 1.
  const keepAsk = band === "At market";
  const [lo, target, hi] = PRICE_WINDOW[heat.label];
  let list: number;
  let bandSuggestion: number | undefined;
  if (keepAsk) {
    list = listing.asking_price_ngn;
    const adjusted = bandAdjust(list);
    if (adjusted !== list) bandSuggestion = adjusted;
  } else {
    const window: [number, number] = [compSet.median * lo, compSet.median * hi];
    list = niceWithin(compSet.median * target, window[0], window[1]);
    const adjusted = bandAdjust(list);
    if (adjusted >= window[0] && adjusted <= window[1]) list = adjusted;
  }
  if (band === "Below market") flags.push({ text: `Asking price sits ${Math.abs(premium * 100).toFixed(1)}% below market: check for underpricing or an undisclosed defect.`, show: ALL });

  const ownerFloor = listing.floor_price_ngn;
  let step = niceWithin(list * STEP_WINDOW[1], list * STEP_WINDOW[0], list * STEP_WINDOW[2]);
  // Without an owner floor, the reference floor (adjusted comp low) never blocks the price step.
  let floor = ownerFloor ?? Math.min(compSet.min, step);
  const floorAboveMarket = ownerFloor !== undefined && ownerFloor > compSet.max;
  if (floorAboveMarket) flags.push({ text: "The owner's floor sits above every adjusted comparable: the campaign is unlikely to close at that floor.", show: WITH_FLOOR });
  let listAtFloor = false;
  if (ownerFloor !== undefined && ownerFloor >= list) {
    listAtFloor = true;
    flags.push({
      text: `The owner's floor (${money(ownerFloor)}) is at or above the market-based price (${money(list)}): list at the floor, with no negotiation room and no price step. Expect a slower ${lease ? "letting" : "sale"}.`,
      show: WITH_FLOOR,
    });
    list = ownerFloor;
    floor = ownerFloor;
  }
  let stepAvailable = !listAtFloor;
  let stepHitFloor = false;
  if (stepAvailable && step < floor) {
    stepHitFloor = true;
    step = floor;
    if (step >= list) stepAvailable = false;
  }
  if (!stepAvailable) step = list;

  // Expected outcomes from the company's own track record where supplied.
  const tr = input.track_record;
  const listPremium = list / compSet.median - 1;
  let expectedClose: number;
  let expectedCloseBasis: string;
  let atAsk: StrategyPlan["outcomes"]["atAsk"];
  let atList: StrategyPlan["outcomes"]["atList"];
  if (tr && Math.abs(listPremium) <= 0.05) {
    expectedClose = list * (1 + tr.at_market_close_vs_list_pct / 100);
    expectedCloseBasis = `list ${tr.at_market_close_vs_list_pct}% (internal at-market history${tr.at_market_n ? `, n=${tr.at_market_n}` : ""})`;
    atList = { close: expectedClose, dom: tr.at_market_dom };
    if (tr.above_market_close_vs_list_pct !== undefined && premium > 0.05) {
      atAsk = { close: listing.asking_price_ngn * (1 + tr.above_market_close_vs_list_pct / 100), dom: tr.above_market_dom };
    }
  } else if (input.list_to_close_discount_pct !== undefined) {
    expectedClose = list * (1 + input.list_to_close_discount_pct / 100);
    expectedCloseBasis = `list ${input.list_to_close_discount_pct}% (overall internal list-to-close history) [Est.]`;
  } else {
    expectedClose = Math.min(list, compSet.median);
    expectedCloseBasis = "adjusted market median [Est.]";
  }

  // Segments from CRM inquiry mix (1 primary, at most 1 secondary at 20% or more).
  const mix = input.segment_mix_pct ?? {};
  const ranked = (Object.entries(mix) as [Segment, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const primary = ranked[0]?.[0];
  const secondary = ranked[1] && ranked[1][1] >= 20 ? ranked[1][0] : undefined;
  const mixSum = ranked.reduce((sum, [, v]) => sum + v, 0);
  if (!primary) flags.push({ text: "No CRM inquiry mix supplied; target segments need evidence [DATA NEEDED: inquiry mix by segment for this price band].", show: ALL });
  if (mixSum > 100.5) flags.push({ text: `Segment shares add up to ${Math.round(mixSum)}%, not 100%: check the CRM export before presenting segment percentages.`, show: ALL });

  // Funnel: back-solve from one close.
  const rates = input.funnel_rates ?? DEFAULT_FUNNEL;
  const closes = 1;
  const offers = safeCeil(closes / rates.offer_to_close);
  const viewings = safeCeil(offers / rates.viewing_to_offer);
  const qualified = safeCeil(viewings / rates.qualified_to_viewing);
  const inquiries = safeCeil(qualified / rates.inquiry_to_qualified);

  // Budget: references/marketing-strategy.md section 7.
  const missing: string[] = [];
  if (input.cost_per_qualified_lead_ngn === undefined) missing.push("target cost per qualified lead");
  if (input.production_cost_ngn === undefined) missing.push("production cost quote");
  if (input.events_cost_ngn === undefined) missing.push("events cost");
  const variable = input.cost_per_qualified_lead_ngn !== undefined ? qualified * input.cost_per_qualified_lead_ngn : undefined;
  const fixedKnown = (input.production_cost_ngn ?? 0) + (input.events_cost_ngn ?? 0);
  const base = (variable ?? 0) + fixedKnown;
  const unit = base >= 1_000_000 ? 100_000 : 10_000;
  const contingency = base > 0 ? Math.max(unit, roundTo(0.1 * base, unit)) : undefined;
  const complete = missing.length === 0;
  const total = complete && contingency !== undefined ? base + contingency : undefined;
  const partialTotal = !complete && base > 0 ? base + (contingency ?? 0) : undefined;
  const fee = input.commission_rate_pct !== undefined ? expectedClose * (input.commission_rate_pct / 100) : undefined;
  const feeRatio = total !== undefined && fee ? total / fee : undefined;
  const overGuardrail = feeRatio !== undefined && feeRatio > BUDGET_GUARDRAIL;
  const overCap = total !== undefined && input.budget_cap_ngn !== undefined && total > input.budget_cap_ngn;
  if (overGuardrail) flags.push({ text: `Budget is ${(feeRatio! * 100).toFixed(1)}% of expected fee, above the 25% guardrail: propose a leaner mix.`, show: LEADERSHIP });
  if (overCap) flags.push({ text: "Budget exceeds the stated cap: trim the variable lines or lower the qualified-lead target.", show: LEADERSHIP });
  if (!complete) flags.push({ text: `Budget total is incomplete until these are supplied: ${missing.join(", ")} [DATA NEEDED].`, show: PAID });

  // Channels: split variable spend and inquiries; lines are non-negative and reconcile to the totals.
  const segmentLabel = [primary, secondary].filter((s): s is Segment => Boolean(s)).map((s) => SEGMENT_SHORT[s]).join(", ") || "All";
  const funded = CHANNELS.filter((c) => c.spend > 0);
  const spendLines = variable !== undefined ? allocate(variable, funded.map((c) => c.spend), variable >= 1_000_000 ? 100_000 : 10_000) : funded.map(() => 0);
  const inquiryLines = allocate(inquiries, CHANNELS.map((c) => c.inquiries), 1);
  const channels: ChannelLine[] = CHANNELS.map((c, i) => {
    const fundedIndex = funded.findIndex((f) => f.key === c.key);
    const name = c.key === "meta" && (primary === "diaspora" || secondary === "diaspora")
      ? "Meta: Reels plus click-to-WhatsApp ads, Lagos plus diaspora cities (London, Houston, Toronto)"
      : c.name;
    return {
      name,
      role: c.role,
      segments: c.key === "agents" && primary ? SEGMENT_SHORT[primary] : segmentLabel,
      budget: fundedIndex >= 0 ? spendLines[fundedIndex] : 0,
      inquiries: inquiryLines[i],
    };
  });

  // Timeline and gates scaled to the close window.
  const launch = parseDate(input.launch_date);
  const closeDays = input.target_close_days ?? 90;
  const scale = (d: number) => Math.min(closeDays - 1, Math.max(1, Math.round((d * closeDays) / 90)));
  const at = (day: number): CumulativeTarget => ({
    day,
    date: addDays(launch, day),
    inquiries: Math.round((inquiries * day) / closeDays),
    qualified: Math.round((qualified * day) / closeDays),
    viewings: Math.round((viewings * day) / closeDays),
    offers: Math.floor((offers * day) / closeDays),
  });
  let [d1, d2, d3] = [scale(14), scale(30), scale(60)];
  d2 = Math.max(d2, d1 + 1);
  d3 = Math.max(d3, d2 + 1);
  const cumulative = [at(d1), at(d2), at(d3), { ...at(closeDays), inquiries, qualified, viewings, offers }];
  const trafficPlan = Math.max(1, cumulative[0].qualified);
  const trafficMinQualified = safeCeil(trafficPlan * 0.5);
  const priceGateViewings = Math.max(1, cumulative[1].viewings);
  const fallback = lease
    ? "reprice the rent, offer flexible payment terms, or withdraw, refresh, and relaunch"
    : input.lease_fallback_rent_ngn_per_year
      ? `lease at about ${formatRent(input.lease_fallback_rent_ngn_per_year)} or withdraw, refresh, and relaunch`
      : "lease, reposition to another segment, or withdraw, refresh, and relaunch";
  const priceAction = !stepAvailable
    ? listAtFloor
      ? "No price step: the list is at the owner's floor. Revisit the floor with the owner or move to the strategy gate"
      : "No price step left above the floor. Revisit the floor with the owner"
    : stepHitFloor
      ? `Step to the floor (${money(step)}); no further room`
      : `Take the pre-approved step to ${money(step)}`;
  // The team version never sees the floor, so a step that lands on it is not named.
  const priceTeamAction = !stepAvailable
    ? "No pre-approved step: escalate to the Head of Sales"
    : stepHitFloor
      ? "Take the pre-approved step; the Head of Sales confirms the new price"
      : `Take the pre-approved step to ${money(step)}`;
  const gates: Gate[] = [
    {
      day: d1,
      date: addDays(launch, d1),
      name: "Traffic",
      threshold: `Fewer than ${trafficMinQualified} qualified leads (50% of pro-rata ${trafficPlan})`,
      action: "Fix creative, targeting, or channel mix; if leads are on target but viewings lag, fix response time and qualification",
      teamAction: "Fix creative, targeting, or channel mix; if leads are on target but viewings lag, fix response time and qualification",
    },
    {
      day: d2,
      date: addDays(launch, d2),
      name: "Price",
      threshold: `${priceGateViewings}+ viewings and no offer, or price is the main objection in 40%+ of viewing feedback`,
      action: priceAction,
      teamAction: priceTeamAction,
    },
    {
      day: d3,
      date: addDays(launch, d3),
      name: "Strategy",
      threshold: stepAvailable ? "Below 50% of cumulative funnel target after the price step" : "Below 50% of cumulative funnel target",
      action: `Fallback: ${fallback}`,
      teamAction: `Fallback: ${fallback}`,
    },
  ];
  const closeDate = addDays(launch, closeDays);
  const december = primary === "diaspora" || secondary === "diaspora" ? decemberWindow(launch, closeDate) : undefined;

  return {
    input,
    compSet,
    premium,
    band,
    perSqm,
    heat,
    confidence: conf,
    pricing: {
      list,
      listPremium,
      floor,
      floorBasis: ownerFloor !== undefined ? "owner" : "adjusted comp low",
      floorAboveMarket,
      listAtFloor,
      step,
      stepAvailable,
      stepHitFloor,
      keepAsk: keepAsk && !listAtFloor,
      bandSuggestion,
    },
    outcomes: { expectedClose, expectedCloseBasis, atAsk, atList },
    segments: { primary, secondary, known: Boolean(primary), mix },
    funnel: { rates, ratesAssumed: !input.funnel_rates, inquiries, qualified, viewings, offers, closes },
    budget: {
      variable,
      production: input.production_cost_ngn,
      events: input.events_cost_ngn,
      contingency,
      total,
      partialTotal,
      missing,
      fee,
      feeRatio,
      overGuardrail,
      overCap,
    },
    channels,
    timeline: { launch, closeDays, closeDate, gates, cumulative, trafficMinQualified, priceGateViewings, decemberWindow: december },
    flags,
  };
}

export function formatPrice(value: number): string {
  return ngn(value);
}

export function formatRent(value: number): string {
  return `${ngn(value)}/yr`;
}
