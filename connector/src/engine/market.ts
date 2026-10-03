import { median, pct } from "./format.js";

export type CompStatus = "closed" | "asking";

export interface Comp {
  label: string;
  description: string;
  status: CompStatus;
  date?: string;
  price_ngn: number;
  /** Sum of attribute adjustments in percent, e.g. 5 for +5%. */
  adjustments_pct?: number;
  adjustment_note?: string;
  source?: string;
  days_listed?: number;
}

export interface AdjustedComp extends Comp {
  closedEquivalent: number;
  adjusted: number;
  discountApplied: boolean;
}

export interface CompSet {
  comps: AdjustedComp[];
  median: number;
  min: number;
  max: number;
  closedCount: number;
  askingCount: number;
  discountPct?: number;
  discountMissing: boolean;
}

/**
 * Two-step adjustment from references/market-analysis.md section 2:
 * asking comps convert to closed-equivalent with the list-to-close discount,
 * then every comp takes its attribute adjustments.
 */
export function adjustComps(comps: Comp[], discountPct?: number): CompSet {
  if (comps.length === 0) throw new Error("At least one comparable is required");
  const adjusted = comps.map((comp): AdjustedComp => {
    const applyDiscount = comp.status === "asking" && discountPct !== undefined;
    const closedEquivalent = applyDiscount ? comp.price_ngn * (1 + discountPct! / 100) : comp.price_ngn;
    return {
      ...comp,
      closedEquivalent,
      adjusted: closedEquivalent * (1 + (comp.adjustments_pct ?? 0) / 100),
      discountApplied: applyDiscount,
    };
  });
  const values = adjusted.map((c) => c.adjusted);
  const askingCount = comps.filter((c) => c.status === "asking").length;
  return {
    comps: adjusted,
    median: median(values),
    min: Math.min(...values),
    max: Math.max(...values),
    closedCount: comps.length - askingCount,
    askingCount,
    discountPct,
    discountMissing: askingCount > 0 && discountPct === undefined,
  };
}

export type PriceBand = "Below market" | "At market" | "Premium" | "Overpriced";

export function priceBand(premium: number): PriceBand {
  if (premium < -0.05) return "Below market";
  if (premium <= 0.05) return "At market";
  if (premium <= 0.1) return "Premium";
  return "Overpriced";
}

export interface HeatInputs {
  nominal_price_change_pct?: number;
  cpi_yoy_pct?: number;
  dom_now?: number;
  dom_year_ago?: number;
  listings_now?: number;
  listings_year_ago?: number;
  inquiries_change_pct?: number;
  rent_change_nominal_pct?: number;
}

export interface HeatSignal {
  name: string;
  value: string;
  score: -1 | 0 | 1;
}

export type HeatLabel = "Hot" | "Warm" | "Cold" | "Unknown";

export interface Heat {
  signals: HeatSignal[];
  total: number;
  label: HeatLabel;
  indicative: boolean;
  realPriceChange?: number;
  realRentChange?: number;
}

function band(value: number, up: number, down: number): -1 | 0 | 1 {
  if (value > up) return 1;
  if (value < down) return -1;
  return 0;
}

export function realChange(nominalPct: number, cpiPct: number): number {
  return (1 + nominalPct / 100) / (1 + cpiPct / 100) - 1;
}

/** Five-signal heat score from references/market-analysis.md section 5. */
export function heatScore(inputs: HeatInputs = {}): Heat {
  const signals: HeatSignal[] = [];
  let realPriceChange: number | undefined;
  let realRentChange: number | undefined;
  const cpi = inputs.cpi_yoy_pct;

  if (inputs.nominal_price_change_pct !== undefined && cpi !== undefined) {
    realPriceChange = realChange(inputs.nominal_price_change_pct, cpi);
    signals.push({
      name: "Real price change, 12m",
      value: `${pct(inputs.nominal_price_change_pct / 100)} nominal, CPI ${cpi.toFixed(1)}%: ${pct(realPriceChange)} real`,
      score: band(realPriceChange, 0.03, -0.03),
    });
  }
  if (inputs.dom_now !== undefined && inputs.dom_year_ago) {
    const change = inputs.dom_now / inputs.dom_year_ago - 1;
    signals.push({
      name: "Median days on market vs 12m ago",
      value: `${inputs.dom_now} vs ${inputs.dom_year_ago} (${pct(change, 0)})`,
      score: band(-change, 0.15, -0.15),
    });
  }
  if (inputs.listings_now !== undefined && inputs.listings_year_ago) {
    const change = inputs.listings_now / inputs.listings_year_ago - 1;
    signals.push({
      name: "Active deduped listings vs 12m ago",
      value: `${inputs.listings_now} vs ${inputs.listings_year_ago} (${pct(change, 0)})`,
      score: band(-change, 0.1, -0.1),
    });
  }
  if (inputs.inquiries_change_pct !== undefined) {
    signals.push({
      name: "Qualified inquiries per listing, 90d vs prior 90d",
      value: pct(inputs.inquiries_change_pct / 100, 0),
      score: band(inputs.inquiries_change_pct / 100, 0.15, -0.15),
    });
  }
  if (inputs.rent_change_nominal_pct !== undefined && cpi !== undefined) {
    realRentChange = realChange(inputs.rent_change_nominal_pct, cpi);
    signals.push({
      name: "Real rent change, 12m",
      value: `${pct(inputs.rent_change_nominal_pct / 100, 0)} nominal: ${pct(realRentChange)} real`,
      score: band(realRentChange, 0.03, -0.03),
    });
  }

  const total = signals.reduce((sum, s) => sum + s.score, 0);
  const label: HeatLabel = signals.length === 0 ? "Unknown" : total >= 2 ? "Hot" : total <= -2 ? "Cold" : "Warm";
  return { signals, total, label, indicative: signals.length > 0 && signals.length <= 3, realPriceChange, realRentChange };
}

export interface Confidence {
  level: "High" | "Medium" | "Low";
  reason: string;
}

/** Confidence rules from references/market-analysis.md section 6. */
export function confidence(set: CompSet, missingInputs: string[] = []): Confidence {
  const counts = `${set.closedCount} closed, ${set.askingCount} asking comps`;
  if (missingInputs.length > 0) return { level: "Low", reason: `missing ${missingInputs.join(", ")}` };
  if (set.discountMissing) return { level: "Low", reason: `${counts}; asking-to-close discount unknown` };
  if (set.closedCount >= 5) return { level: "High", reason: counts };
  if (set.closedCount >= 3) return { level: "Medium", reason: `${counts}${set.askingCount ? ", asking adjusted by internal list-to-close history" : ""}` };
  if (set.comps.length >= 5) return { level: "Medium", reason: `${counts}, asking adjusted by internal list-to-close history` };
  return { level: "Low", reason: counts };
}
