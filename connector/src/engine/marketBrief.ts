import { addDays, parseDate, pct } from "./format.js";
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
} from "./market.js";

export type BriefAction = "Reprice" | "Lease" | "Sell" | "Hold";

export interface MarketBriefInput {
  asset: {
    id: string;
    district: string;
    type: string;
    bedrooms?: number;
    plot_sqm?: number;
    built_sqm?: number;
    title: string;
    status?: string;
    asking_price_ngn?: number;
    /** Days the asset has been listed, when it is on the market. */
    days_listed?: number;
  };
  comps: Comp[];
  list_to_close_discount_pct?: number;
  heat?: HeatInputs;
  /** Segment median days on market, for the reprice test. */
  segment_median_dom?: number;
  rent_estimate_ngn_per_year?: number;
  segment_median_gross_yield_pct?: number;
  service_charge_ngn_per_year?: number;
  maintenance_ngn_per_year?: number;
  vacancy_months?: number;
  hurdle_rate_pct?: number;
  owner_objective?: "liquidity" | "return";
  as_of_date: string;
  review_date?: string;
}

export interface MarketBrief {
  input: MarketBriefInput;
  compSet: CompSet;
  heat: Heat;
  confidence: Confidence;
  value: number;
  perSqm?: { basis: "plot" | "built"; value: number };
  premium?: number;
  yields?: { gross: number; net: number; segmentMedian?: number; netRent: number; voidMonthCost: number };
  totalReturn?: number;
  breakevenAppreciation?: number;
  action: BriefAction;
  provisional: boolean;
  reason: string;
  supporting: string[];
  counter: string;
  trigger: string;
  reviewDate: Date;
  warnings: string[];
}

/** Decision rules from references/market-analysis.md section 7. */
export function buildMarketBrief(input: MarketBriefInput): MarketBrief {
  const warnings: string[] = [];
  const compSet = adjustComps(input.comps, input.list_to_close_discount_pct);
  if (compSet.discountMissing) warnings.push("Asking comps used without a measured asking-to-close discount [DATA NEEDED: list vs close pairs].");
  const heat = heatScore(input.heat);
  if (heat.label === "Unknown") warnings.push("No market heat signals supplied [DATA NEEDED: heat inputs].");
  else if (heat.missing.length) warnings.push(`Heat score uses ${heat.signals.length} of 5 signals; not scored: ${heat.missing.join("; ")}.`);
  const value = compSet.median;
  const size = input.asset.plot_sqm ?? input.asset.built_sqm;
  const missingInputs = size ? [] : ["plot or built size"];
  if (!size) warnings.push("No plot or built size supplied: price per sqm is not shown [DATA NEEDED: size].");
  const conf = confidence(compSet, missingInputs);
  const perSqm = size ? { basis: (input.asset.plot_sqm ? "plot" : "built") as "plot" | "built", value: value / size } : undefined;
  const premium = input.asset.asking_price_ngn ? input.asset.asking_price_ngn / value - 1 : undefined;

  let yields: MarketBrief["yields"];
  if (input.rent_estimate_ngn_per_year) {
    const rent = input.rent_estimate_ngn_per_year;
    const vacancy = input.vacancy_months ?? 1;
    if (input.vacancy_months === undefined) warnings.push("[Assumption] Vacancy allowance of 1 month a year; supply vacancy_months to replace it.");
    if (input.service_charge_ngn_per_year === undefined) warnings.push("Service charge not supplied; net yield overstated [DATA NEEDED: service charge].");
    if (input.maintenance_ngn_per_year === undefined) warnings.push("Maintenance not supplied; net yield overstated [DATA NEEDED: maintenance budget].");
    const netRent = rent - (input.service_charge_ngn_per_year ?? 0) - (input.maintenance_ngn_per_year ?? 0) - (rent * vacancy) / 12;
    yields = {
      gross: rent / value,
      net: netRent / value,
      segmentMedian: input.segment_median_gross_yield_pct !== undefined ? input.segment_median_gross_yield_pct / 100 : undefined,
      netRent,
      voidMonthCost: rent / 12,
    };
  }

  const appreciation = input.heat?.nominal_price_change_pct !== undefined ? input.heat.nominal_price_change_pct / 100 : undefined;
  const hurdle = input.hurdle_rate_pct !== undefined ? input.hurdle_rate_pct / 100 : undefined;
  const totalReturn = yields && appreciation !== undefined ? yields.net + appreciation : undefined;
  const breakevenAppreciation = yields && hurdle !== undefined ? hurdle - yields.net : undefined;
  const clearsHurdle = totalReturn !== undefined && hurdle !== undefined ? totalReturn >= hurdle : undefined;
  const realRent = heat.realRentChange;
  const realPrice = heat.realPriceChange;

  const supporting: string[] = [];
  const leaseCase =
    yields?.segmentMedian !== undefined && yields.gross >= yields.segmentMedian + 0.01 && (realRent === undefined || realRent >= -0.03);
  const overpriced = premium !== undefined && priceBand(premium) === "Overpriced";
  const domKnown = input.asset.days_listed !== undefined && input.segment_median_dom !== undefined;
  const stale = domKnown && input.asset.days_listed! > 1.5 * input.segment_median_dom!;

  let action: BriefAction;
  let reason: string;
  let provisional = false;
  if (overpriced && (stale || !domKnown)) {
    action = "Reprice";
    provisional = !domKnown;
    reason = `asking sits ${pct(premium!)} over the adjusted median; reprice into ${fmtRange(compSet)}`;
    supporting.push(`Asking is ${pct(premium!)} above the adjusted market median.`);
    if (stale) supporting.push(`Listed ${input.asset.days_listed} days, above 1.5x the segment median of ${input.segment_median_dom}.`);
    else warnings.push("Reprice test incomplete: the methodology also needs days listed above 1.5x the segment median [DATA NEEDED: days listed, segment median DOM].");
  } else if (leaseCase && clearsHurdle !== false) {
    action = "Lease";
    reason = "the yield is well above the segment median and rents are holding up";
  } else if (heat.label === "Cold" && clearsHurdle === false) {
    action = "Sell";
    reason = "the market is cold and holding returns miss the hurdle";
  } else if (input.owner_objective === "liquidity" && (heat.label === "Hot" || heat.label === "Warm") && (premium === undefined || premium <= 0.05)) {
    action = "Sell";
    reason = "the owner wants liquidity, the market is not cold, and the asset can be sold at market";
  } else if (clearsHurdle === false) {
    action = "Sell";
    reason = "holding returns miss the hurdle";
  } else if (clearsHurdle === true) {
    action = "Hold";
    reason = "holding returns clear the hurdle";
  } else {
    action = "Hold";
    provisional = true;
    reason = "provisional: there is not enough data to test hold against sell [DATA NEEDED: rent estimate, hurdle rate, 12-month price trend]";
  }
  if (overpriced && domKnown && !stale) supporting.push(`Asking is ${pct(premium!)} above market, but the listing is still within 1.5x the segment median DOM; re-test before repricing.`);

  if (yields?.segmentMedian !== undefined) {
    const gap = yields.gross - yields.segmentMedian;
    supporting.push(`Gross yield of ${pct(yields.gross, 1, false)} is ${Math.abs(gap * 100).toFixed(1)} points ${gap >= 0 ? "above" : "below"} the segment median (${pct(yields.segmentMedian, 1, false)}).`);
  }
  if (realRent !== undefined) supporting.push(`Real rents ${pct(realRent)} year on year (nominal ${pct((input.heat!.rent_change_nominal_pct ?? 0) / 100, 0)}, CPI ${input.heat!.cpi_yoy_pct!.toFixed(1)}%).`);
  if (input.heat?.dom_now !== undefined && input.heat.dom_year_ago) {
    const change = input.heat.dom_now / input.heat.dom_year_ago - 1;
    supporting.push(`Sale days on market ${change >= 0 ? "up" : "down"} ${Math.abs(change * 100).toFixed(0)}% year on year${change > 0.1 && action !== "Sell" ? ": a sale now means a longer campaign into a softening market" : ""}.`);
  }
  if (totalReturn !== undefined && hurdle !== undefined && yields) {
    supporting.push(`Hold-and-lease nominal return of ${pct(totalReturn, 1, false)} (${pct(yields.net, 1, false)} net yield plus ${pct(appreciation!, 1, false)} price trend) ${totalReturn >= hurdle ? "clears" : "misses"} the ${pct(hurdle, 0, false)} hurdle.`);
  }

  let counter = "No strong counter-signal in the data supplied.";
  if (action !== "Sell" && realPrice !== undefined && realPrice < 0) {
    const margin = totalReturn !== undefined && hurdle !== undefined ? ` and the margin over the hurdle is ${((totalReturn - hurdle) * 100).toFixed(1)} points` : "";
    counter = `Real prices are down ${Math.abs(realPrice * 100).toFixed(1)}%${margin}.`;
  } else if (action === "Sell" && leaseCase) {
    counter = "The yield case for leasing is strong; selling forgoes above-median income.";
  }

  const reviewDate = input.review_date ? parseDate(input.review_date) : addDays(parseDate(input.as_of_date), 180);
  let trigger: string;
  switch (action) {
    case "Sell":
      trigger = "if no acceptable offer arrives within 60 days of listing, reprice into the adjusted comp range";
      break;
    case "Reprice":
      trigger = "if inquiries do not recover within 30 days of the new price, step again or withdraw and relaunch";
      break;
    default:
      trigger = breakevenAppreciation !== undefined
        ? `prepare a sale if the 12-month nominal price trend falls below ${pct(breakevenAppreciation, 1, false)}`
        : "re-run this brief with updated comps and rents";
  }

  if (supporting.length < 3) warnings.push("Fewer than 3 supporting signals: treat the recommendation as provisional.");

  return {
    input,
    compSet,
    heat,
    confidence: conf,
    value,
    perSqm,
    premium,
    yields,
    totalReturn,
    breakevenAppreciation,
    action,
    provisional,
    reason,
    supporting,
    counter,
    trigger,
    reviewDate,
    warnings,
  };
}

function fmtRange(set: CompSet): string {
  return `₦${(set.min / 1e6).toFixed(1)}M to ₦${(set.max / 1e6).toFixed(1)}M`;
}
