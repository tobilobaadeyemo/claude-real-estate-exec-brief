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
}

export interface GateResult {
  name: string;
  day: number;
  due: boolean;
  fired: boolean;
  threshold: string;
  action: string;
}

export interface CampaignUpdate {
  day: number;
  week: number;
  status: CampaignStatus;
  stages: StageRow[];
  gates: GateResult[];
  efficiency: { channel: string; spend: number; qualified: number; cpql?: number; vsTarget?: string }[];
  actionsMissed: boolean;
}

/** Template D logic from references/output-templates.md. */
export function buildCampaignUpdate(plan: StrategyPlan, actuals: CampaignActuals): CampaignUpdate {
  const day = Math.max(0, daysBetween(plan.timeline.launch, parseDate(actuals.as_of_date)));
  const total = plan.timeline.closeDays;
  const share = Math.min(1, day / total);
  const f = plan.funnel;
  const stages: StageRow[] = [
    { stage: "Inquiries", plan: Math.round(f.inquiries * share), actual: actuals.inquiries },
    { stage: "Qualified leads", plan: Math.round(f.qualified * share), actual: actuals.qualified },
    { stage: "Viewings", plan: Math.round(f.viewings * share), actual: actuals.viewings },
    { stage: "Offers", plan: Math.round(f.offers * share), actual: actuals.offers },
  ].map((row) => ({ ...row, ratio: row.plan > 0 ? row.actual / row.plan : undefined }));

  const [traffic, price, strategy] = plan.timeline.gates;
  const qualifiedRow = stages[1];
  const viewingsTarget = plan.timeline.cumulative[1].viewings;
  const priceObjection = (actuals.price_objection_share_pct ?? 0) >= 40;
  const below50 = stages.some((s) => s.ratio !== undefined && s.ratio < 0.5);
  const gates: GateResult[] = [
    {
      name: traffic.name,
      day: traffic.day,
      due: day >= traffic.day,
      fired: day >= traffic.day && qualifiedRow.ratio !== undefined && qualifiedRow.ratio < 0.5,
      threshold: traffic.threshold,
      action: traffic.action,
    },
    {
      name: price.name,
      day: price.day,
      due: day >= price.day,
      fired: day >= price.day && ((actuals.viewings >= Math.max(1, viewingsTarget) && actuals.offers === 0) || priceObjection),
      threshold: price.threshold,
      action: actuals.price_step_taken ? "Price step already taken" : price.action,
    },
    {
      name: strategy.name,
      day: strategy.day,
      due: day >= strategy.day,
      fired: day >= strategy.day && below50 && Boolean(actuals.price_step_taken),
      threshold: strategy.threshold,
      action: strategy.action,
    },
  ];

  const actionsMissed = gates.some((g) => g.fired && g.name === "Price" && !actuals.price_step_taken);
  const ratios = stages.map((s) => s.ratio).filter((r): r is number => r !== undefined);
  let status: CampaignStatus = "On track";
  if (ratios.some((r) => r < 0.8)) status = "At risk";
  if (ratios.some((r) => r < 0.5) || actionsMissed) status = "Off track";

  const cpqlTarget = plan.input.cost_per_qualified_lead_ngn;
  const efficiency = (actuals.spend_by_channel ?? []).map((row) => {
    const cpql = row.qualified > 0 ? row.spend_ngn / row.qualified : undefined;
    const vsTarget = cpql !== undefined && cpqlTarget ? `${cpql <= cpqlTarget ? "within" : "over"} target` : undefined;
    return { channel: row.channel, spend: row.spend_ngn, qualified: row.qualified, cpql, vsTarget };
  });

  return { day, week: Math.max(1, Math.ceil(day / 7)), status, stages, gates, efficiency, actionsMissed };
}
