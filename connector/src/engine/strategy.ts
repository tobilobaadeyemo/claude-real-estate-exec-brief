import { addDays, ngn, parseDate, priceStep, roundPrice, roundTo, safeCeil } from "./format.js";
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

const UPLIFT: Record<Heat["label"], number> = { Hot: 0.04, Warm: 0.015, Cold: 0, Unknown: 0.015 };
const STEP_DOWN = 0.035;
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
  perSqm?: { basis: "plot" | "built"; subject: number; market: number };
  heat: Heat;
  confidence: Confidence;
  pricing: {
    list: number;
    listPremium: number;
    floor: number;
    floorBasis: "owner" | "adjusted comp low";
    floorAboveMarket: boolean;
    step: number;
    stepHitFloor: boolean;
    keepAsk: boolean;
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
    total?: number;
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
    decemberWindow?: { from: Date; to: Date };
  };
  warnings: string[];
}

function bandAdjust(price: number): number {
  const unit = 10 ** Math.floor(Math.log10(price));
  const edge = Math.floor(price / unit) * unit;
  if (price > edge && price <= edge * 1.02) return edge - priceStep(price);
  return price;
}

function decemberWindow(launch: Date, close: Date): { from: Date; to: Date } | undefined {
  for (let year = launch.getUTCFullYear(); year <= close.getUTCFullYear(); year++) {
    const from = new Date(Date.UTC(year, 11, 15));
    const to = new Date(Date.UTC(year + 1, 0, 5));
    if (from <= close && to >= launch) return { from, to };
  }
  return undefined;
}

export function buildStrategy(input: StrategyInput): StrategyPlan {
  const warnings: string[] = [];
  const { listing } = input;
  const compSet = adjustComps(input.comps, input.list_to_close_discount_pct);
  if (compSet.discountMissing) {
    warnings.push("Asking comps used without an asking-to-close discount: closed prices typically sit below asking; magnitude unknown [DATA NEEDED: list vs close pairs].");
  }
  const premium = listing.asking_price_ngn / compSet.median - 1;
  const band = priceBand(premium);
  const heat = heatScore(input.heat);
  if (heat.label === "Unknown") warnings.push("No market heat signals supplied; pricing uses the Warm default [DATA NEEDED: heat inputs].");
  const conf = confidence(compSet);

  const sizeBasis = listing.plot_sqm ? "plot" : listing.built_sqm ? "built" : undefined;
  const size = listing.plot_sqm ?? listing.built_sqm;
  const perSqm = sizeBasis && size
    ? { basis: sizeBasis as "plot" | "built", subject: listing.asking_price_ngn / size, market: compSet.median / size }
    : undefined;

  // Pricing plan: references/marketing-strategy.md section 1.
  const keepAsk = band === "At market";
  const target = compSet.median * (1 + UPLIFT[heat.label]);
  let list = keepAsk ? listing.asking_price_ngn : roundPrice(target);
  list = bandAdjust(list);
  if (band === "Below market") warnings.push(`Asking price sits ${Math.abs(premium * 100).toFixed(1)}% below market: check for underpricing or an undisclosed defect.`);

  const ownerFloor = listing.floor_price_ngn;
  const floor = ownerFloor ?? compSet.min;
  const floorAboveMarket = floor > compSet.max;
  if (floorAboveMarket) warnings.push("The floor sits above every adjusted comparable: the campaign is unlikely to close at that floor.");
  let step = roundPrice(list * (1 - STEP_DOWN));
  const stepHitFloor = step < floor;
  if (stepHitFloor) step = floor;

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

  // Segments from CRM inquiry mix.
  const mix = input.segment_mix_pct ?? {};
  const ranked = (Object.entries(mix) as [Segment, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const primary = ranked[0]?.[0];
  const secondary = ranked[1] && ranked[1][1] >= 20 ? ranked[1][0] : undefined;
  if (!primary) warnings.push("No CRM inquiry mix supplied; target segments need evidence [DATA NEEDED: inquiry mix by segment for this price band].");

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
  const contingency = variable !== undefined ? roundTo(0.1 * (variable + fixedKnown), 100_000) : undefined;
  const total = variable !== undefined && contingency !== undefined ? variable + fixedKnown + contingency : undefined;
  const fee = input.commission_rate_pct !== undefined ? expectedClose * (input.commission_rate_pct / 100) : undefined;
  const feeRatio = total !== undefined && fee ? total / fee : undefined;
  const overGuardrail = feeRatio !== undefined && feeRatio > BUDGET_GUARDRAIL;
  const overCap = total !== undefined && input.budget_cap_ngn !== undefined && total > input.budget_cap_ngn;
  if (overGuardrail) warnings.push(`Budget is ${(feeRatio! * 100).toFixed(1)}% of expected fee, above the 25% guardrail: propose a leaner mix.`);
  if (overCap) warnings.push("Budget exceeds the stated cap: trim the variable lines or lower the qualified-lead target.");

  // Channels: split variable spend and inquiries, remainder on the last funded line so totals reconcile.
  const segmentLabel = [primary, secondary].filter((s): s is Segment => Boolean(s)).map((s) => SEGMENT_SHORT[s]).join(", ") || "All";
  let spendLeft = variable ?? 0;
  let inquiriesLeft = inquiries;
  const channels: ChannelLine[] = CHANNELS.map((c, i) => {
    const isLastSpend = c.key === "google";
    const isLast = i === CHANNELS.length - 1;
    const spend = variable === undefined || c.spend === 0 ? 0 : isLastSpend ? spendLeft : roundTo(variable * c.spend, 100_000);
    spendLeft -= spend;
    const inq = isLast ? inquiriesLeft : Math.round(inquiries * c.inquiries);
    inquiriesLeft -= inq;
    const name = c.key === "meta" && (primary === "diaspora" || secondary === "diaspora")
      ? "Meta: Reels plus click-to-WhatsApp ads, Lagos plus diaspora cities (London, Houston, Toronto)"
      : c.name;
    return { name, role: c.role, segments: c.key === "agents" && primary ? SEGMENT_SHORT[primary] : segmentLabel, budget: spend, inquiries: inq };
  });

  // Timeline and gates scaled to the close window.
  const launch = parseDate(input.launch_date);
  const closeDays = input.target_close_days ?? 90;
  const scale = (d: number) => Math.max(1, Math.round((d * closeDays) / 90));
  const at = (day: number): CumulativeTarget => ({
    day,
    date: addDays(launch, day),
    inquiries: Math.round((inquiries * day) / closeDays),
    qualified: Math.round((qualified * day) / closeDays),
    viewings: Math.round((viewings * day) / closeDays),
    offers: Math.round((offers * day) / closeDays),
  });
  const [d1, d2, d3] = [scale(14), scale(30), scale(60)];
  const cumulative = [at(d1), at(d2), at(d3), { ...at(closeDays), inquiries, qualified, viewings, offers }];
  const trafficThreshold = safeCeil(cumulative[0].qualified * 0.5);
  const priceViewings = Math.max(1, cumulative[1].viewings);
  const fallback = input.lease_fallback_rent_ngn_per_year
    ? `lease at about ${formatRent(input.lease_fallback_rent_ngn_per_year)} or withdraw, refresh, and relaunch`
    : "lease, reposition to another segment, or withdraw, refresh, and relaunch";
  const gates: Gate[] = [
    {
      day: d1,
      date: addDays(launch, d1),
      name: "Traffic",
      threshold: `Fewer than ${trafficThreshold} qualified leads (50% of pro-rata ${cumulative[0].qualified})`,
      action: "Fix creative, targeting, or channel mix; if leads are on target but viewings lag, fix response time and qualification",
    },
    {
      day: d2,
      date: addDays(launch, d2),
      name: "Price",
      threshold: `${priceViewings}+ viewings and no offer, or price is the main objection in 40%+ of viewing feedback`,
      action: stepHitFloor ? `Step to the floor (${formatPrice(step)}); no further room` : `Take the pre-approved step to ${formatPrice(step)}`,
    },
    {
      day: d3,
      date: addDays(launch, d3),
      name: "Strategy",
      threshold: "Below 50% of cumulative funnel target after the price step",
      action: `Fallback: ${fallback}`,
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
    pricing: { list, listPremium, floor, floorBasis: ownerFloor !== undefined ? "owner" : "adjusted comp low", floorAboveMarket, step, stepHitFloor, keepAsk },
    outcomes: { expectedClose, expectedCloseBasis, atAsk, atList },
    segments: { primary, secondary, known: Boolean(primary), mix },
    funnel: { rates, ratesAssumed: !input.funnel_rates, inquiries, qualified, viewings, offers, closes },
    budget: {
      variable,
      production: input.production_cost_ngn,
      events: input.events_cost_ngn,
      contingency,
      total,
      missing,
      fee,
      feeRatio,
      overGuardrail,
      overCap,
    },
    channels,
    timeline: { launch, closeDays, closeDate, gates, cumulative, decemberWindow: december },
    warnings,
  };
}

export function formatPrice(value: number): string {
  return ngn(value);
}

export function formatRent(value: number): string {
  return `${ngn(value)}/yr`;
}
