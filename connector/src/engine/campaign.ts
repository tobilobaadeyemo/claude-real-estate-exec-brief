import { daysBetween, parseDate } from "./format.js";
import type { StrategyPlan } from "./strategy.js";

export interface CampaignActuals {
  as_of_date: string;
  inquiries: number;
  qualified: number;
  viewings: number;
  offers: number;
  price_objection_share_pct?: number;
  price_step_taken?: boolean;
  spend_by_channel?: { channel: string; spend_ngn: number; qualified: number }[];
  objections?: { objection: string; share_pct: number }[];
}

export type CampaignStatus = "On track" | "At risk" | "Off track";

export interface StageRow {
  stage: string;
  plan: number;
  actual: number;
  ratio?: number;
  /** Why a stage is not scored yet, when it is not. */
  note?: string;
}

export interface GateResult {
  name: string;
  day: number;
  due: boolean;
  fired: boolean;
  threshold: string;
  action: string;
  teamAction: string;
}

export interface CampaignUpdate {
  asOf: Date;
  day: number;
  week: number;
  status: CampaignStatus;
  pastClose: boolean;
  stages: StageRow[];
  gates: GateResult[];
  efficiency: { channel: string; spend: number; qualified: number; cpql?: number; vsTarget?: string }[];
  objections: { objection: string; share_pct: number }[];
  actionsMissed: boolean;
}

/** Days since launch for an as-of date; negative before launch. */
export function campaignDay(plan: StrategyPlan, asOfDate: string): number {
  return daysBetween(plan.timeline.launch, parseDate(asOfDate));
}

/** Template D logic from references/output-templates.md. Callers reject dates on or before launch. */
export function buildCampaignUpdate(plan: StrategyPlan, actuals: CampaignActuals): CampaignUpdate {
  const asOf = parseDate(actuals.as_of_date);
  const day = campaignDay(plan, actuals.as_of_date);
  if (day <= 0) throw new Error("Campaign updates start the day after launch");
  const total = plan.timeline.closeDays;
  const pastClose = day > total;
  const share = Math.min(1, day / total);
  const f = plan.funnel;
  const [traffic, price, strategy] = plan.timeline.gates;
  const offersScored = day >= price.day;

  const stages: StageRow[] = [
    { stage: "Inquiries", plan: Math.round(f.inquiries * share), actual: actuals.inquiries },
    { stage: "Qualified leads", plan: Math.round(f.qualified * share), actual: actuals.qualified },
    { stage: "Viewings", plan: Math.round(f.viewings * share), actual: actuals.viewings },
    offersScored
      ? { stage: "Offers", plan: Math.floor(f.offers * share), actual: actuals.offers }
      : { stage: "Offers", plan: 0, actual: actuals.offers, note: `scored from the price gate (day ${price.day})` },
  ].map((row) => ({ ...row, ratio: row.plan > 0 && !row.note ? row.actual / row.plan : undefined }));

  const priceObjection = (actuals.price_objection_share_pct ?? 0) >= 40;
  const below50 = stages.some((s) => s.ratio !== undefined && s.ratio < 0.5);
  const gates: GateResult[] = [
    {
      name: traffic.name,
      day: traffic.day,
      due: day >= traffic.day,
      fired: day >= traffic.day && actuals.qualified < plan.timeline.trafficMinQualified,
      threshold: traffic.threshold,
      action: traffic.action,
      teamAction: traffic.teamAction,
    },
    {
      name: price.name,
      day: price.day,
      due: day >= price.day,
      fired: day >= price.day && ((actuals.viewings >= plan.timeline.priceGateViewings && actuals.offers === 0) || priceObjection),
      threshold: price.threshold,
      action: actuals.price_step_taken ? "Price step already taken" : price.action,
      teamAction: actuals.price_step_taken ? "Price step already taken" : price.teamAction,
    },
    {
      name: strategy.name,
      day: strategy.day,
      due: day >= strategy.day,
      fired: day >= strategy.day && below50 && (Boolean(actuals.price_step_taken) || !plan.pricing.stepAvailable),
      threshold: strategy.threshold,
      action: strategy.action,
      teamAction: strategy.teamAction,
    },
  ];

  const actionsMissed = gates.some((g) => g.fired && g.name === "Price" && !actuals.price_step_taken && plan.pricing.stepAvailable);
  const ratios = stages.map((s) => s.ratio).filter((r): r is number => r !== undefined);
  let status: CampaignStatus = "On track";
  if (ratios.some((r) => r < 0.8)) status = "At risk";
  if (ratios.some((r) => r < 0.5) || actionsMissed || pastClose) status = "Off track";

  const cpqlTarget = plan.input.cost_per_qualified_lead_ngn;
  const efficiency = (actuals.spend_by_channel ?? []).map((row) => {
    const cpql = row.qualified > 0 ? row.spend_ngn / row.qualified : undefined;
    const vsTarget = cpql !== undefined && cpqlTarget ? `${cpql <= cpqlTarget ? "within" : "over"} target` : undefined;
    return { channel: row.channel, spend: row.spend_ngn, qualified: row.qualified, cpql, vsTarget };
  });
  const objections = [...(actuals.objections ?? [])].sort((a, b) => b.share_pct - a.share_pct).slice(0, 3);

  return { asOf, day, week: Math.max(1, Math.ceil(day / 7)), status, pastClose, stages, gates, efficiency, objections, actionsMissed };
}
