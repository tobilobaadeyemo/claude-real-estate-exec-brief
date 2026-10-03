import { longDate, ngn, pct, usd } from "./format.js";
import type { CompSet, Heat } from "./market.js";
import type { MarketBrief } from "./marketBrief.js";
import type { CampaignUpdate } from "./campaign.js";
import { SEGMENT_NAMES, type Audience, type StrategyPlan } from "./strategy.js";

export interface RenderContext {
  asOf: Date;
  planId?: string;
  unlockUrl?: string;
  creditCost?: number;
}

const COMPLIANCE =
  "ARCON vetting for all paid creative | NDPA 2023 consent and opt-out on broadcast and email lists | LASRERA registration for every practitioner on the deal | Title described exactly as held. Confirm current requirements with compliance before launch.";

const DISCLAIMER =
  "Not legal, tax, or formal valuation advice. Title and legal matters require solicitor review; formal valuations require a registered estate surveyor and valuer.";

function table(headers: string[], rows: (string | number)[][], align?: ("l" | "r")[]): string {
  const sep = headers.map((_, i) => (align?.[i] === "r" ? "---:" : "---"));
  return [headers, sep, ...rows.map((r) => r.map(String))].map((r) => `| ${r.join(" | ")} |`).join("\n");
}

function heatText(heat: Heat): string {
  if (heat.label === "Unknown") return "Unknown `[DATA NEEDED: heat inputs]`";
  const score = `${heat.total > 0 ? "+" : ""}${heat.total}`;
  return `${heat.label} (${score})${heat.indicative ? ", indicative" : ""}`;
}

function rangeText(set: CompSet): string {
  return `${ngn(set.min)} to ${ngn(set.max)}`;
}

function bandImplication(band: string): string {
  switch (band) {
    case "Overpriced":
      return "Expect slow inquiry and a stale listing unless repriced.";
    case "Premium":
      return "Holds only with 2 or more documented differentiators.";
    case "Below market":
      return "Fast sale likely; check for underpricing or an undisclosed defect.";
    default:
      return "Price is not the main lever; presentation and speed are.";
  }
}

function words(plan: StrategyPlan) {
  const sale = plan.input.transaction === "sale";
  return {
    price: sale ? "Price" : "Annual rent",
    ask: sale ? "ask" : "asking rent",
    buyer: sale ? "Buyer" : "Tenant",
    buyers: sale ? "buyers" : "tenants",
    close: sale ? "Sale" : "Signed lease",
    closeVerb: sale ? "Close" : "Signed lease",
    offers: sale ? "Offers" : "Applications passing screening",
  };
}

function marketPositionTable(plan: StrategyPlan, audience: Audience): string {
  const w = words(plan);
  const { compSet: set, heat, input } = plan;
  const rows: string[][] = [
    [w.price, `${ngn(input.listing.asking_price_ngn)} ${w.ask}`, `${ngn(set.median)} adj. median (${rangeText(set)})`, `${plan.band} (${pct(plan.premium)})`],
  ];
  if (plan.perSqm) {
    rows.push([`${w.price} / sqm of ${plan.perSqm.basis === "plot" ? "plot" : "built area"}`, ngn(plan.perSqm.subject, 2), ngn(plan.perSqm.market, 2), plan.perSqm.subject > set.max / (input.listing.plot_sqm ?? input.listing.built_sqm ?? 1) ? "Above every adjusted comp" : "Within the comp range"]);
  }
  if (heat.realPriceChange !== undefined && input.heat?.nominal_price_change_pct !== undefined) {
    rows.push(["Price trend, 12m", "n/a", `${pct(input.heat.nominal_price_change_pct / 100)} nominal / ${pct(heat.realPriceChange)} real`, heat.realPriceChange < -0.03 ? "Falling in real terms" : heat.realPriceChange > 0.03 ? "Rising in real terms" : "Flat in real terms"]);
  }
  if (input.heat?.dom_now !== undefined) {
    const prior = input.heat.dom_year_ago ? ` (${input.heat.dom_year_ago} a year ago)` : "";
    rows.push(["Days on market", "n/a", `${input.heat.dom_now} median${prior}`, input.heat.dom_year_ago && input.heat.dom_now > input.heat.dom_year_ago ? "Slower than last year" : "Steady or faster"]);
  }
  rows.push(["Market heat", "n/a", heatText(heat), heat.signals.filter((s) => s.score !== 0).map((s) => `${s.name.split(",")[0]} ${s.score > 0 ? "+" : "-"}`).join("; ") || "No strong signals"]);
  if (input.fx_ngn_per_usd && audience !== "team") {
    const fx = input.fx_ngn_per_usd;
    rows.push(["USD equivalent", `${usd(input.listing.asking_price_ngn / fx)} ${w.ask}`, usd(set.median / fx), `At ₦${fx.toLocaleString("en-US")}/$ [CBN]`]);
  }
  return table(["Metric", "Subject", "Market", "Read"], rows, ["l", "r", "r", "l"]);
}

function header(plan: StrategyPlan, audience: Audience | "preview", ctx: RenderContext): string {
  const l = plan.input.listing;
  const version = audience === "preview" ? "Free preview" : audience[0].toUpperCase() + audience.slice(1);
  const prepared = plan.input.presenter ? `Prepared by: ${plan.input.presenter} | ` : "";
  const title = audience === "preview" ? "Marketing Strategy Preview" : "Marketing Strategy";
  return [
    `# ${title}: ${l.id}, ${l.district}`,
    `${prepared}Version: ${version} | Date: ${longDate(ctx.asOf)}${ctx.planId ? ` | Plan ID: \`${ctx.planId}\`` : ""}`,
    `Confidence: ${plan.confidence.level} (${plan.confidence.reason})`,
  ].join("\n");
}

export function renderStrategyPreview(plan: StrategyPlan, ctx: RenderContext): string {
  const l = plan.input.listing;
  const parts = [
    header(plan, "preview", ctx),
    "## Diagnosis",
    [
      `- **Price position:** ${ngn(l.asking_price_ngn)} is ${pct(plan.premium)} vs the adjusted market median of ${ngn(plan.compSet.median)}: **${plan.band}**. ${bandImplication(plan.band)}`,
      `- **Market heat:** ${heatText(plan.heat)}.`,
      `- **Evidence:** ${plan.compSet.closedCount} closed and ${plan.compSet.askingCount} asking comps.`,
    ].join("\n"),
    "## Market Position",
    marketPositionTable(plan, "leadership"),
    ...warningsBlock(plan.warnings),
    "## Locked in the full strategy",
    "- Recommended list price, floor, negotiation band, and a pre-agreed price step with its dated trigger",
    "- Expected outcome at the owner's price vs the recommended price",
    "- Target buyers and positioning, channel plan with budget lines, back-solved funnel targets",
    "- Dated review gates, risks with owners, decisions needed, compliance flags",
    "- Comparables appendix, presenter notes and likely Q&A, plus client and team versions",
    ctx.unlockUrl
      ? `**Unlock the full strategy (${ctx.creditCost ?? 3} credits):** ${ctx.unlockUrl}\nAfter paying, ask Claude to run the strategy again.`
      : "",
    "_Free preview: one per account._",
  ];
  return parts.filter(Boolean).join("\n\n");
}

function warningsBlock(warnings: string[]): string[] {
  if (!warnings.length) return [];
  return ["## Data Gaps and Flags", warnings.map((w) => `- ${w}`).join("\n")];
}

export function renderStrategy(plan: StrategyPlan, audience: Audience, ctx: RenderContext): string {
  const w = words(plan);
  const { input, pricing, outcomes, funnel, budget, timeline, segments } = plan;
  const l = input.listing;
  const showFloor = audience !== "team";
  const showEconomics = audience === "leadership";
  const out: string[] = [header(plan, audience, ctx)];

  // Bottom line.
  const buyer = segments.primary
    ? `${SEGMENT_NAMES[segments.primary]} first${segments.secondary ? `, ${SEGMENT_NAMES[segments.secondary].toLowerCase()} second` : ""}.`
    : "`[DATA NEEDED: CRM inquiry mix]`";
  const budgetLine = budget.total !== undefined ? ` on a ${ngn(budget.total)} budget${showEconomics && budget.feeRatio ? ` (${(budget.feeRatio * 100).toFixed(1)}% of expected fee)` : ""}` : "";
  const priceLine = pricing.keepAsk
    ? `Keep ${ngn(pricing.list)}: the ${w.ask} is at market (${pct(plan.premium)} vs adjusted median ${ngn(plan.compSet.median)}).`
    : `List at ${ngn(pricing.list)}, not ${ngn(l.asking_price_ngn)}. The ${w.ask} is ${pct(plan.premium)} vs the adjusted market median of ${ngn(plan.compSet.median)}.`;
  out.push(
    "## Bottom Line",
    [
      `- **${w.price}:** ${priceLine}`,
      `- **${w.buyer}:** ${buyer}`,
      `- **Plan:** ${w.closeVerb} by ${longDate(timeline.closeDate)}${budgetLine}, with a pre-agreed step to ${ngn(pricing.step)} on ${longDate(timeline.gates[1].date)} if the price gate fires.`,
    ].join("\n"),
  );

  out.push("## Market Position", audience === "team" ? `${w.price} sits ${pct(plan.premium)} vs the adjusted market median of ${ngn(plan.compSet.median)} (${plan.band}). Market heat: ${heatText(plan.heat)}.` : marketPositionTable(plan, audience));

  if (outcomes.atAsk && outcomes.atList && input.track_record && audience !== "team") {
    const tr = input.track_record;
    out.push(
      audience === "client" ? "**What our sales history shows** (anonymized):" : "**Our track record decides the price** [Closed: internal]:",
      table(
        ["Launch price vs market", "Closed vs list", "Median days on market"],
        [
          [`Within 5% of market${tr.at_market_n ? ` (n=${tr.at_market_n})` : ""}`, `${tr.at_market_close_vs_list_pct}%`, tr.at_market_dom ?? "n/a"],
          [`More than 5% above market${tr.above_market_n ? ` (n=${tr.above_market_n})` : ""}`, `${tr.above_market_close_vs_list_pct}%`, tr.above_market_dom ?? "n/a"],
        ],
        ["l", "r", "r"],
      ),
      `At ${ngn(l.asking_price_ngn)}, history points to about ${ngn(outcomes.atAsk.close)}${outcomes.atAsk.dom ? ` after about ${outcomes.atAsk.dom} days` : ""}. At ${ngn(pricing.list)}, about ${ngn(outcomes.atList.close)}${outcomes.atList.dom ? ` after about ${outcomes.atList.dom} days` : ""}.`,
    );
  }

  // Pricing plan.
  const pricingRows: string[][] = [[`List ${w.price.toLowerCase()}`, ngn(pricing.list), pricing.keepAsk ? "Owner ask, at market" : `${pct(pricing.listPremium)} vs adj. median; search-band checked`]];
  if (showFloor) {
    pricingRows.push(["Floor", ngn(pricing.floor), pricing.floorBasis === "owner" ? `Owner's stated minimum${pricing.floorAboveMarket ? "; above every comp" : ""}` : "Adjusted comp low (no owner floor given)"]);
    pricingRows.push(["Negotiation band", `${ngn(pricing.floor)} to ${ngn(pricing.list)}`, "Authorized negotiators only"]);
  }
  pricingRows.push(["Price step", `${ngn(pricing.step)} on ${longDate(timeline.gates[1].date)}`, `Trigger: ${timeline.gates[1].threshold}`]);
  out.push("## Pricing Plan", table(["Item", "Value", "Basis"], pricingRows, ["l", "r", "l"]));
  if (audience === "team") out.push("Negotiation goes to authorized negotiators only. Quote the list price.");

  // Segments and positioning.
  const mix = segments.mix;
  const segLines: string[] = [];
  if (segments.primary) segLines.push(`**Primary:** ${SEGMENT_NAMES[segments.primary]}. ${mix[segments.primary]}% of qualified inquiries in this band [Internal CRM].`);
  if (segments.secondary) segLines.push(`**Secondary:** ${SEGMENT_NAMES[segments.secondary]}. ${mix[segments.secondary]}% of qualified inquiries [Internal CRM].`);
  if (!segments.primary) segLines.push("`[DATA NEEDED: CRM inquiry mix by segment for this price band]`");
  if (timeline.decemberWindow) segLines.push(`December window: in-person viewings for visiting diaspora ${w.buyers} ${longDate(timeline.decemberWindow.from)} to ${longDate(timeline.decemberWindow.to)}; diaspora ads run from launch.`);
  const amenities = l.amenities?.length ? l.amenities.join(", ") : "`[DATA NEEDED: key amenities]`";
  segLines.push(
    `**Positioning:** ${l.condition ? `${l.condition} ` : ""}${l.bedrooms ? `${l.bedrooms}-bed ` : ""}${l.type.replace(/_/g, " ")} in ${l.district}, priced at the market, with ${l.title.replace(/_/g, " ")}. Draft the one-liner from this.`,
    `**Proof points to evidence:** ${amenities}; title type stated exactly; peak-hour drive times \`[DATA NEEDED: measure weekday 08:00 drive times]\`.`,
    "**Trust stack:** title stated exactly, solicitor search report on verified request, funds held by solicitor until completion, live video viewings for diaspora.",
  );
  out.push(`## Target ${w.buyer}s and Positioning`, segLines.join("\n"));

  // Channels.
  if (audience === "client") {
    out.push(
      `## Where ${w.buyers[0].toUpperCase() + w.buyers.slice(1)} Will See It`,
      [
        "- Premium placement on Nigerian Property Centre and PropertyPro, with one consistent listing across all agents",
        `- Targeted Instagram and Facebook video${timeline.decemberWindow || segments.secondary === "diaspora" || segments.primary === "diaspora" ? " in Lagos and diaspora cities" : " in Lagos"}, plus Google search`,
        "- Our agent network, our opted-in contact database, an open house, and live virtual viewings",
      ].join("\n"),
    );
  } else {
    const rows = plan.channels.map((c) => [c.name, c.role, c.segments, c.budget ? ngn(c.budget) : "₦0", String(c.inquiries)]);
    rows.push(["**Total**", "", "", budget.variable !== undefined ? `**${ngn(budget.variable)}**` : "`[DATA NEEDED]`", `**${funnel.inquiries}**`]);
    out.push("## Channel Plan", table(["Channel", "Role", "Segment", "Budget", "Target inquiries"], rows, ["l", "l", "l", "r", "r"]));
  }

  // Budget.
  const budgetRows: string[][] = [];
  budgetRows.push([
    input.cost_per_qualified_lead_ngn !== undefined ? `Lead generation: ${funnel.qualified} qualified leads x ${ngn(input.cost_per_qualified_lead_ngn)}` : "Lead generation",
    budget.variable !== undefined ? ngn(budget.variable) : "`[DATA NEEDED: target cost per qualified lead]`",
  ]);
  budgetRows.push(["Production: photos, video, floor plan, 3D tour", budget.production !== undefined ? ngn(budget.production) : "`[DATA NEEDED: production quote]`"]);
  budgetRows.push(["Events: open house, live virtual viewings", budget.events !== undefined ? ngn(budget.events) : "`[DATA NEEDED: events cost]`"]);
  budgetRows.push(["Contingency (about 10%)", budget.contingency !== undefined ? ngn(budget.contingency) : "n/a"]);
  budgetRows.push(["**Total**", budget.total !== undefined ? `**${ngn(budget.total)}**` : "`[DATA NEEDED]`"]);
  const budgetNotes: string[] = [];
  if (showEconomics && budget.fee !== undefined) {
    budgetNotes.push(`Expected fee: ${input.commission_rate_pct}% x ${ngn(outcomes.expectedClose)} expected close (${outcomes.expectedCloseBasis}) = ${ngn(budget.fee)}.${budget.feeRatio !== undefined ? ` Budget = ${(budget.feeRatio * 100).toFixed(1)}% of fee (guardrail 25%).` : ""}`);
  }
  if (showEconomics && input.budget_cap_ngn !== undefined && budget.total !== undefined) budgetNotes.push(`${budget.overCap ? "Over" : "Within"} the ${ngn(input.budget_cap_ngn)} cap.`);
  if (audience === "client") budgetNotes.push("Who pays: as set out in your agency agreement `[confirm against the signed mandate]`.");
  out.push(audience === "client" ? "## Marketing Budget" : "## Budget", table(["Line", "Amount"], budgetRows, ["l", "r"]), ...budgetNotes);

  // Funnel.
  const r = funnel.rates;
  const basis = funnel.ratesAssumed ? " [Assumption: placeholder rates]" : " [Internal CRM]";
  out.push(
    "## Funnel Targets",
    table(
      ["Stage", "Target", `Conversion basis${basis}`],
      [
        ["Inquiries", String(funnel.inquiries), ""],
        ["Qualified leads", String(funnel.qualified), `${pct(r.inquiry_to_qualified, 0, false)} of inquiries`],
        ["Viewings", String(funnel.viewings), `${pct(r.qualified_to_viewing, 0, false)} of qualified`],
        [w.offers, String(funnel.offers), `${pct(r.viewing_to_offer, 0, false)} of viewings`],
        [w.close, String(funnel.closes), `${pct(r.offer_to_close, 0, false)} of offers, by ${longDate(timeline.closeDate)}`],
      ],
      ["l", "r", "l"],
    ),
  );
  if (audience === "team") {
    out.push(
      "**Cumulative targets**",
      table(
        ["By", "Inquiries", "Qualified", "Viewings", "Offers"],
        timeline.cumulative.map((c) => [`Day ${c.day} (${longDate(c.date)})`, c.inquiries, c.qualified, c.viewings, c.offers]),
        ["l", "r", "r", "r", "r"],
      ),
    );
  }

  // Gates.
  const gateRows = [
    [`Before ${longDate(timeline.launch)}`, "Launch readiness", "Assets, trust pack, canonical listing, agent briefing, owner sign-off on price, step, and fallback", "If ARCON approval is pending, launch portals, agents, and organic first"],
    ...timeline.gates.map((g) => [longDate(g.date), g.name, g.threshold, g.action]),
    [longDate(timeline.closeDate), `${w.close} target`, "", ""],
  ];
  out.push("## Timeline and Review Gates", table(["Date", "Gate", "Threshold", "Action"], gateRows));

  // Risks.
  out.push(audience === "client" ? "## Risks We Are Managing" : "## Risks and Mitigations", risksTable(plan, audience));

  // Decisions.
  out.push("## Decisions Needed", decisions(plan, audience));
  out.push("## Compliance", COMPLIANCE);
  out.push(...warningsBlock(plan.warnings));
  out.push("## Sources and Assumptions", sources(plan, audience));
  out.push("---", "## Appendix: Comparables", compsTable(plan.compSet, audience));
  if (plan.heat.signals.length) {
    out.push("**Heat score detail**", table(["Signal", "Value", "Score"], [...plan.heat.signals.map((s) => [s.name, s.value, s.score > 0 ? `+${s.score}` : String(s.score)]), ["**Total**", "", `**${heatText(plan.heat)}**`]], ["l", "l", "r"]));
  }
  if (audience === "team") out.push("---", executionAppendix(plan));
  out.push("---", presenterNotes(plan, audience), "", DISCLAIMER);
  return out.join("\n\n");
}

function risksTable(plan: StrategyPlan, audience: Audience): string {
  const rows: string[][] = [];
  const supplyUp = plan.input.heat?.listings_now && plan.input.heat.listings_year_ago ? plan.input.heat.listings_now / plan.input.heat.listings_year_ago - 1 : 0;
  const diaspora = plan.segments.primary === "diaspora" || plan.segments.secondary === "diaspora";
  if (!plan.pricing.keepAsk && audience !== "team") rows.push(["Owner rejects the recommended price", "M", "Present the comps and track record; agree the step rule in writing", "Strategist, Head of Sales"]);
  rows.push(["Agents list at other prices", "H", "One canonical listing; co-broke terms require our price and photos", "Listings lead"]);
  if (supplyUp > 0.1) rows.push([`Supply up ${(supplyUp * 100).toFixed(0)}% YoY`, "M", "Price at market; lead with condition, power, and title; refresh creative at the traffic gate", "Strategist"]);
  if (diaspora) rows.push(["Diaspora fraud concern lowers conversion", "M", "Trust stack, solicitor-held funds, live video viewings", "Sales lead"]);
  if (audience !== "client") rows.push(["ARCON approval delays paid start", "M", "Portals, agents, and organic carry week 1", "Marketing ops"]);
  if (plan.pricing.floorAboveMarket) rows.push(["Floor above every comparable", "H", "Reset the floor with the owner before launch", "Head of Sales"]);
  if (diaspora && plan.input.fx_ngn_per_usd && audience !== "team") rows.push(["FX moves change the USD price", "L", "Refresh USD figures monthly", "Strategist"]);
  rows.push(["Flood or drainage questions at viewings", "L", "Disclose drainage history `[DATA NEEDED: owner flood history]`", "Sales lead"]);
  if (audience === "client") return table(["Risk", "How we handle it"], rows.map((r) => [r[0], r[2]]));
  return table(["Risk", "Likelihood", "Mitigation", "Owner"], rows);
}

function decisions(plan: StrategyPlan, audience: Audience): string {
  const p = plan.pricing;
  const g = plan.timeline.gates[1];
  if (audience === "client") {
    return [
      `1. Sign-off on list ${ngn(p.list)}, floor ${ngn(p.floor)}, and the ${longDate(g.date)} price-step rule.`,
      "2. Copies for our solicitor: title document, survey plan, renovation receipts.",
      "3. Drainage and flood history for the property and street.",
      "4. Viewing access: preferred days and notice period.",
    ].join("\n");
  }
  if (audience === "team") {
    return [
      `1. Owner sign-off on price and step rule before ${longDate(plan.timeline.launch)}: Strategist, Head of Sales.`,
      "2. Week 0 tasks in the execution plan completed by their due dates.",
      "3. Weekly dashboard every Monday: Performance marketer.",
    ].join("\n");
  }
  const lines = [`1. Approve list ${ngn(p.list)}, step to ${ngn(p.step)} on the ${longDate(g.date)} trigger, floor ${ngn(p.floor)}.`];
  if (plan.budget.total !== undefined) lines.push(`2. Approve the ${ngn(plan.budget.total)} budget${plan.budget.feeRatio !== undefined ? ` (${(plan.budget.feeRatio * 100).toFixed(1)}% of expected fee)` : ""}.`);
  if (plan.segments.secondary) lines.push(`${lines.length + 1}. Approve ${SEGMENT_NAMES[plan.segments.secondary].toLowerCase()} as the secondary segment within the Meta and Google lines.`);
  lines.push(`${lines.length + 1}. Mandate the Strategist and Head of Sales to take the price plan to the owner before launch.`);
  return lines.join("\n");
}

function sources(plan: StrategyPlan, audience: Audience): string {
  const bySource = new Map<string, number>();
  for (const c of plan.compSet.comps) bySource.set(c.source ?? (c.status === "closed" ? "Closed comps" : "Asking comps"), (bySource.get(c.source ?? (c.status === "closed" ? "Closed comps" : "Asking comps")) ?? 0) + 1);
  const rows = [...bySource.entries()].map(([s, n]) => [audience === "client" && /internal/i.test(s) ? "Our closed sales (anonymized)" : s, `${n} comp${n > 1 ? "s" : ""}`]);
  if (plan.input.heat?.cpi_yoy_pct !== undefined) rows.push(["NBS", `Headline CPI ${plan.input.heat.cpi_yoy_pct.toFixed(1)}% YoY`]);
  if (plan.input.fx_ngn_per_usd) rows.push(["CBN", `₦${plan.input.fx_ngn_per_usd.toLocaleString("en-US")}/$ official rate`]);
  if (plan.compSet.discountPct !== undefined) rows.push(["Internal deal history", `Asking-to-close discount ${plan.compSet.discountPct}%`]);
  const assumptions: string[] = [];
  if (plan.funnel.ratesAssumed) assumptions.push("funnel conversion rates are placeholders until CRM rates are supplied");
  assumptions.push("channel split of spend and inquiries uses the default mix; replace with CRM channel history");
  return `${table(["Source", "Data used"], rows)}\n\nFigures are as supplied in this request; as-of dates are those of the underlying exports. Assumptions: ${assumptions.join("; ")}.`;
}

function compsTable(set: CompSet, audience: Audience): string {
  const rows = set.comps.map((c) => {
    const adj: string[] = [];
    if (c.discountApplied) adj.push(`${set.discountPct}% (asking to close)`);
    if (c.adjustments_pct) adj.push(`${c.adjustments_pct > 0 ? "+" : ""}${c.adjustments_pct}%${c.adjustment_note ? ` (${c.adjustment_note})` : ""}`);
    const status = c.status === "closed" ? "Closed" : `Asking${c.days_listed ? `, ${c.days_listed} days listed` : ""}`;
    const row = [c.label, c.description, status, c.date ?? "", ngn(c.price_ngn), adj.join(", ") || "none", ngn(c.adjusted)];
    if (audience !== "client") row.push(c.source ?? "");
    return row;
  });
  const headers = ["#", "Property", "Status", "Date", "Price", "Adjustments", "Adjusted"];
  if (audience !== "client") headers.push("Source");
  return `${table(headers, rows)}\n\nAdjusted median ${ngn(set.median)}, range ${rangeText(set)}.${audience === "client" ? " Internal comparables are anonymized." : ""}`;
}

function executionAppendix(plan: StrategyPlan): string {
  const launch = plan.timeline.launch;
  const d = (offset: number) => longDate(new Date(launch.getTime() + offset * 86_400_000));
  return [
    "## Appendix: Execution Plan",
    table(
      ["Task", "Owner", "Due", "Done when"],
      [
        ["Owner sign-off on price, step rule, and fallback", "Strategist, Head of Sales", d(-5), "Signed note on file"],
        ["Submit paid creative for ARCON vetting", "Marketing ops", d(-6), "Submission reference logged"],
        ["Measure weekday 08:00 drive times to key nodes", "Content lead", d(-4), "Location sheet updated"],
        ["Photos, video, floor plan, 3D tour", "Content lead", d(-3), "Assets in shared drive"],
        ["Trust pack: title summary, survey, search report requested", "Sales lead with solicitor", d(-3), "Pack ready for verified buyers"],
        ["Consent check on broadcast and email lists (NDPA)", "Marketing ops", d(-3), "Non-consented contacts removed"],
        ["Canonical listing copy and price; co-broke terms to agents", "Listings lead", d(-2), "Terms acknowledged"],
        ["Campaigns built with UTMs; click-to-WhatsApp live", "Performance marketer", d(-2), "Campaigns in review"],
        ["CRM tags, WhatsApp Business catalog, response rota", "Sales ops", d(-2), "Rota published"],
      ],
    ),
    "**Lead handling:** first reply within 15 minutes, 08:00 to 20:00 WAT; after-hours leads answered by 09:00 WAT. Qualify on budget near the list price, timeline of 6 months or less, decision-maker or mandated proxy, and funding route. Refer any offer or discount request to an authorized negotiator.",
    `**CRM tags:** \`${plan.input.listing.id}\` · \`seg:local|diaspora|investor\` · \`src:npc|propertypro|meta|google|agent|crm\` · \`stage:inquiry|qualified|viewing|offer|closed\``,
    `**UTM convention:** \`utm_source=meta|google\` · \`utm_medium=paid_social|paid_search\` · \`utm_campaign=${plan.input.listing.id.toLowerCase().replace(/[^a-z0-9]/g, "")}_launch\` · \`utm_content=<creative_id>\``,
  ].join("\n\n");
}

function presenterNotes(plan: StrategyPlan, audience: Audience): string {
  const p = plan.pricing;
  const l = plan.input.listing;
  const o = plan.outcomes;
  const gate = plan.timeline.gates[1];
  const lines: string[] = ["## Presenter Notes"];
  if (audience === "team") {
    lines.push(
      `**Opening:** "We launch ${l.id} on ${longDate(plan.timeline.launch)} at ${ngn(p.list)}. Our job is ${plan.funnel.qualified} qualified ${plan.input.transaction === "sale" ? "buyers" : "tenants"} and ${plan.funnel.viewings} viewings by ${longDate(plan.timeline.closeDate)}. One consistent listing everywhere, replies inside 15 minutes, and a trust story buyers believe. Gates are on ${plan.timeline.gates.map((g) => longDate(g.date)).join(", ")}."`,
      "**Likely questions**",
      `- *Can I offer a discount to close a lead?* No. Quote ${ngn(p.list)} and pass the lead to an authorized negotiator.`,
      "- *What counts as qualified?* Budget near the list price, timeline of 6 months or less, decision-maker identified, funding route known.",
    );
    return lines.join("\n\n");
  }
  const history = o.atAsk && o.atList ? ` At ${ngn(l.asking_price_ngn)}, our history says about ${ngn(o.atAsk.close)}${o.atAsk.dom ? ` after ${o.atAsk.dom} days` : ""}; at ${ngn(p.list)}, about ${ngn(o.atList.close)}${o.atList.dom ? ` after ${o.atList.dom} days` : ""}.` : "";
  const opening = p.keepAsk
    ? `"The price is right where the market is. Our job is presentation and speed. If it isn't working by ${longDate(gate.date)}, we step to ${ngn(p.step)}, a rule agreed upfront."`
    : `"We're recommending ${ngn(p.list)}, not ${ngn(l.asking_price_ngn)}: the ${plan.input.transaction === "sale" ? "ask" : "asking rent"} is ${pct(plan.premium)} over comparable ${plan.input.transaction === "sale" ? "homes" : "lettings"} once adjusted.${history} If it isn't working by ${longDate(gate.date)}, we step to ${ngn(p.step)}, a rule agreed upfront.${audience === "leadership" && plan.budget.total !== undefined ? ` I need approval on price, budget (${ngn(plan.budget.total)}), and the step rule today.` : " I need your sign-off on the price and the step rule."}"`;
  lines.push(
    `**Opening:** ${opening}`,
    `**Three numbers:** ${ngn(plan.compSet.median)} market median. ${ngn(p.list)} list. ${audience === "client" ? `${ngn(p.floor)} floor` : plan.budget.total !== undefined ? `${ngn(plan.budget.total)} budget` : `${ngn(p.step)} step`}.`,
    `**Concede if pushed:** confidence is ${plan.confidence.level.toLowerCase()} (${plan.confidence.reason}).`,
    `**Do not concede:** listing above the adjusted comp range without documented differentiators.`,
    "**Likely questions**",
  );
  if (audience === "client") {
    lines.push(
      "- *\"My property is worth more.\"* Walk through the closed comps and their adjustments, then offer the agreed price step as the safeguard.",
      "- *\"Who sees my documents?\"* Only verified buyers, through our solicitor. Listings state the title type only.",
      `- *\"What if nothing happens by ${longDate(plan.timeline.closeDate)}?\"* The ${longDate(plan.timeline.gates[2].date)} review decides the fallback, with your approval.`,
    );
  } else {
    lines.push(
      `- *Why not list at ${ngn(l.asking_price_ngn)} and negotiate?* ${o.atAsk ? `Our above-market launches closed ${plan.input.track_record?.above_market_close_vs_list_pct}% vs list.` : "Above-market listings go stale and negotiate down further."}`,
      plan.budget.feeRatio !== undefined ? `- *Is the budget worth it?* ${(plan.budget.feeRatio * 100).toFixed(1)}% of expected fee, built from ${plan.funnel.qualified} qualified leads at the target cost per lead.` : "- *Is the budget worth it?* Supply the cost per qualified lead to answer with numbers.",
      plan.segments.secondary ? `- *Why ${plan.segments.secondary}?* ${plan.segments.mix[plan.segments.secondary]}% of qualified inquiries in this band.` : "- *Who buys?* Answer from the CRM inquiry mix.",
      `- *What if there are no offers by ${longDate(gate.date)}?* Step to ${ngn(p.step)}, pre-approved. The ${longDate(plan.timeline.gates[2].date)} gate decides the fallback.`,
    );
  }
  return lines.join("\n\n");
}

export function renderMarketBriefPreview(brief: MarketBrief, ctx: RenderContext): string {
  const a = brief.input.asset;
  return [
    `# Market Brief Preview: ${a.id}, ${a.district}`,
    `Free preview | Date: ${longDate(ctx.asOf)} | Confidence: ${brief.confidence.level} (${brief.confidence.reason})`,
    "## Snapshot",
    briefSnapshot(brief),
    ...warningsBlock(brief.warnings),
    "## Locked in the full brief",
    "- The recommended action (hold, sell, lease, or reprice) with 3+ supporting signals and the strongest counter-signal",
    "- Dated re-test trigger, risks and opportunities, next steps with owners, comparables appendix",
    ctx.unlockUrl ? `**Unlock the full brief (${ctx.creditCost ?? 2} credits):** ${ctx.unlockUrl}\nAfter paying, ask Claude to run the brief again.` : "",
    "_Free preview: one per account._",
  ].filter(Boolean).join("\n\n");
}

function briefSnapshot(brief: MarketBrief): string {
  const set = brief.compSet;
  const rows: string[][] = [
    ["Value", brief.input.asset.asking_price_ngn ? `${ngn(brief.input.asset.asking_price_ngn)} ask` : "n/a", `${ngn(set.median)} adj. median (${rangeText(set)})`, brief.premium !== undefined ? `${pct(brief.premium)} vs market` : "Market value basis for yields"],
  ];
  if (brief.perSqm) rows.push([`Price / sqm of ${brief.perSqm.basis === "plot" ? "plot" : "built area"}`, "n/a", ngn(brief.perSqm.value, 2), ""]);
  if (brief.heat.realPriceChange !== undefined) rows.push(["Price trend, 12m", "n/a", `${pct(brief.input.heat!.nominal_price_change_pct! / 100)} nominal / ${pct(brief.heat.realPriceChange)} real`, brief.heat.realPriceChange < 0 ? "Falling in real terms" : "Rising in real terms"]);
  if (brief.yields) {
    rows.push(["Gross yield", pct(brief.yields.gross, 1, false), brief.yields.segmentMedian !== undefined ? `${pct(brief.yields.segmentMedian, 1, false)} segment median` : "n/a", brief.yields.segmentMedian !== undefined ? `${((brief.yields.gross - brief.yields.segmentMedian) * 100).toFixed(1)} points vs median` : ""]);
    rows.push(["Net yield", pct(brief.yields.net, 1, false), "n/a", "After service charge, maintenance, vacancy"]);
  }
  rows.push(["Market heat", "n/a", heatText(brief.heat), ""]);
  return table(["Metric", "Subject", "Market", "Read"], rows, ["l", "r", "r", "l"]);
}

export function renderMarketBrief(brief: MarketBrief, ctx: RenderContext): string {
  const a = brief.input.asset;
  const out = [
    `# Market Brief: ${a.id}, ${a.district}`,
    `Date: ${longDate(ctx.asOf)} | Confidence: ${brief.confidence.level} (${brief.confidence.reason})`,
    "## Recommendation",
    `**${brief.action}**: ${brief.reason}. Re-test on ${longDate(brief.reviewDate)}: ${brief.trigger}.`,
    "## Snapshot",
    briefSnapshot(brief),
    "## Evidence",
    `Supporting signals:\n${brief.supporting.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nStrongest counter-signal: ${brief.counter}`,
  ];
  if (brief.yields) {
    out.push("## Risks and Opportunities", table(["Type", "Item", "Response"], [
      ["Risk", `Tenant default or long void: each extra void month costs about ${ngn(brief.yields.voidMonthCost)}`, "Screening, corporate tenant preferred, 1-year term"],
      ["Risk", "Service charge increase compresses net yield", "Confirm next year's budget with the facility manager"],
      ["Risk", brief.breakevenAppreciation !== undefined ? `Price trend falls below ${pct(brief.breakevenAppreciation, 1, false)} nominal` : "Price trend weakens", "Quarterly re-test; sale-ready pack prepared"],
      ["Opportunity", "Sale later with a sitting tenant and proven rent", "Keep lease terms assignable; document rent history"],
    ]));
  }
  out.push("## Next Steps", table(["Action", "Owner", "Due"], nextSteps(brief)));
  out.push(...warningsBlock(brief.warnings));
  out.push("---", "## Appendix: Comparables", compsTable(brief.compSet, "leadership"));
  if (brief.heat.signals.length) out.push("**Heat score detail**", table(["Signal", "Value", "Score"], [...brief.heat.signals.map((s) => [s.name, s.value, s.score > 0 ? `+${s.score}` : String(s.score)]), ["**Total**", "", `**${heatText(brief.heat)}**`]], ["l", "l", "r"]));
  out.push("", DISCLAIMER);
  return out.join("\n\n");
}

function nextSteps(brief: MarketBrief): string[][] {
  const review = longDate(brief.reviewDate);
  switch (brief.action) {
    case "Lease":
      return [
        [`List for rent at ${brief.input.rent_estimate_ngn_per_year ? ngn(brief.input.rent_estimate_ngn_per_year) + "/yr" : "the estimated rent"}; brief relocation agents`, "Leasing lead", "Within 7 days"],
        ["Lease terms and tenant screening reviewed by solicitor, including Lagos Tenancy Law checks", "Legal", "Within 14 days"],
        ["Re-test sale vs hold against the trigger", "Strategist, Investment committee", review],
      ];
    case "Reprice":
      return [
        ["Reprice into the adjusted comp range and refresh the listing", "Listings lead", "Within 7 days"],
        ["Re-test response after 30 days", "Strategist", review],
      ];
    case "Sell":
      return [
        ["Commission a listing marketing strategy for the sale", "Strategist", "Within 7 days"],
        ["Prepare the trust pack (title, survey, search report)", "Sales lead with solicitor", "Within 14 days"],
      ];
    default:
      return [
        ["Hold; refresh comps and rent evidence quarterly", "Asset manager", "Quarterly"],
        ["Re-test hold vs sell against the trigger", "Strategist, Investment committee", review],
      ];
  }
}

export function renderCampaignUpdate(plan: StrategyPlan, update: CampaignUpdate, ctx: RenderContext): string {
  const l = plan.input.listing;
  const fired = update.gates.filter((g) => g.fired);
  const bottom = `${update.status}: ${update.stages.filter((s) => s.ratio !== undefined).map((s) => `${s.stage.toLowerCase()} at ${Math.round(s.ratio! * 100)}% of plan`).join(", ")}.`;
  const gateLine = fired.length ? `Gate fired: ${fired.map((g) => `${g.name} (${g.action})`).join("; ")}.` : "No gate fired.";
  const out = [
    `# Campaign Update: ${l.id}, Week ${update.week} (Day ${update.day} of ${plan.timeline.closeDays})`,
    `Date: ${longDate(ctx.asOf)} | Status: **${update.status}**${ctx.planId ? ` | Plan ID: \`${ctx.planId}\`` : ""}`,
    "## Bottom Line",
    `${bottom} ${gateLine}`,
    "## Funnel vs Plan (cumulative)",
    table(["Stage", "Plan to date", "Actual", "% of plan"], update.stages.map((s) => [s.stage, s.plan, s.actual, s.ratio !== undefined ? `${Math.round(s.ratio * 100)}%` : "n/a"]), ["l", "r", "r", "r"]),
  ];
  if (update.efficiency.length) {
    out.push("## Spend and Efficiency", table(["Channel", "Spend to date", "Qualified leads", "Cost per qualified lead", "vs target"], update.efficiency.map((e) => [e.channel, ngn(e.spend), e.qualified, e.cpql !== undefined ? ngn(e.cpql) : "n/a", e.vsTarget ?? "n/a"]), ["l", "r", "r", "r", "l"]));
  }
  out.push(
    "## Gate Check",
    table(["Gate", "Due", "Threshold", "Result", "Action"], update.gates.map((g) => [g.name, `Day ${g.day}`, g.threshold, !g.due ? "Not yet due" : g.fired ? "Fired" : "Not fired", g.fired ? g.action : ""])),
    "Status rule: On track if every stage is at 80% or more of plan; At risk if any stage is between 50% and 79%; Off track if any stage is below 50% or a gate fired without its action taken.",
  );
  return out.join("\n\n");
}
