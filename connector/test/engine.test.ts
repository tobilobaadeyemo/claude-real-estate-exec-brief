import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStrategy } from "../src/engine/strategy.js";
import { buildMarketBrief } from "../src/engine/marketBrief.js";
import { buildCampaignUpdate } from "../src/engine/campaign.js";
import { renderStrategy, renderStrategyPreview, renderMarketBrief, renderCampaignUpdate } from "../src/engine/render.js";
import { ngn, roundPrice } from "../src/engine/format.js";
import { IK203, LK014 } from "./fixtures.js";

const close = (actual: number, expected: number, tol = 1e-6) => assert.ok(Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
const ctx = { asOf: new Date(Date.UTC(2026, 9, 3)), planId: "pln_test" };

test("LK-014 comps, position, and heat match the worked example", () => {
  const plan = buildStrategy(LK014);
  close(plan.compSet.median, 586_500_000);
  close(plan.compSet.min, 570_400_000);
  close(plan.compSet.max, 625_600_000);
  assert.equal(plan.band, "Overpriced");
  assert.equal(plan.premium.toFixed(3), "0.108");
  assert.equal(plan.heat.total, 1);
  assert.equal(plan.heat.label, "Warm");
  assert.equal(plan.confidence.level, "Medium");
});

test("LK-014 pricing plan and outcomes", () => {
  const plan = buildStrategy(LK014);
  assert.equal(plan.pricing.list, 595_000_000);
  assert.equal(plan.pricing.step, 575_000_000);
  assert.equal(plan.pricing.floor, 560_000_000);
  close(plan.outcomes.expectedClose, 577_150_000);
  close(plan.outcomes.atAsk!.close, 572_000_000);
});

test("LK-014 funnel, budget, channels, and gates", () => {
  const plan = buildStrategy(LK014);
  assert.deepEqual([plan.funnel.inquiries, plan.funnel.qualified, plan.funnel.viewings, plan.funnel.offers], [160, 40, 14, 2]);
  assert.equal(plan.budget.variable, 2_600_000);
  assert.equal(plan.budget.contingency, 500_000);
  assert.equal(plan.budget.total, 5_400_000);
  assert.equal(plan.budget.feeRatio!.toFixed(3), "0.187");
  assert.equal(plan.budget.overCap, false);
  assert.deepEqual(plan.channels.map((c) => c.budget), [600_000, 1_500_000, 500_000, 0, 0]);
  assert.deepEqual(plan.channels.map((c) => c.inquiries), [60, 55, 15, 20, 10]);
  assert.deepEqual(plan.timeline.gates.map((g) => g.date.toISOString().slice(0, 10)), ["2026-10-26", "2026-11-11", "2026-12-11"]);
  assert.match(plan.timeline.gates[0].threshold, /Fewer than 3 qualified leads \(50% of pro-rata 6\)/);
  assert.match(plan.timeline.gates[1].threshold, /^5\+ viewings/);
  assert.equal(plan.timeline.closeDate.toISOString().slice(0, 10), "2027-01-10");
  assert.ok(plan.timeline.decemberWindow);
});

test("audience versions respect the matrix", () => {
  const plan = buildStrategy(LK014);
  const leadership = renderStrategy(plan, "leadership", ctx);
  const client = renderStrategy(plan, "client", ctx);
  const team = renderStrategy(plan, "team", ctx);
  assert.match(leadership, /% of expected fee/);
  assert.doesNotMatch(client, /expected fee|commission|guardrail/i);
  assert.doesNotMatch(client, /Closed: internal|\| Adjusted \| Source \|/);
  assert.match(client, /₦560M/);
  assert.doesNotMatch(team, /₦560M|Floor|expected fee/);
  assert.match(team, /Appendix: Execution Plan/);
  assert.match(team, /Cumulative targets/);
});

test("preview locks the prescription", () => {
  const plan = buildStrategy(LK014);
  const preview = renderStrategyPreview(plan, { ...ctx, unlockUrl: "https://example.test/buy/x", creditCost: 3 });
  assert.match(preview, /Overpriced/);
  assert.match(preview, /₦586\.5M/);
  assert.doesNotMatch(preview, /₦595M|₦575M|₦5\.4M/);
  assert.match(preview, /https:\/\/example\.test\/buy\/x/);
});

test("missing data is flagged, not invented", () => {
  const plan = buildStrategy({ ...LK014, list_to_close_discount_pct: undefined, track_record: undefined, cost_per_qualified_lead_ngn: undefined, segment_mix_pct: undefined, heat: undefined });
  assert.equal(plan.confidence.level, "Low");
  assert.equal(plan.budget.total, undefined);
  const text = renderStrategy(plan, "leadership", ctx);
  assert.match(text, /DATA NEEDED: list vs close pairs/);
  assert.match(text, /DATA NEEDED: target cost per qualified lead/);
  assert.match(text, /DATA NEEDED: CRM inquiry mix/);
});

test("owner floor above every comp is called out", () => {
  const plan = buildStrategy({ ...LK014, listing: { ...LK014.listing, floor_price_ngn: 640_000_000 } });
  assert.equal(plan.pricing.floorAboveMarket, true);
  assert.ok(plan.flags.some((f) => /unlikely to close at that floor/.test(f.text)));
  assert.equal(plan.pricing.step, 640_000_000);
});

test("hot market lists higher than cold", () => {
  const hot = buildStrategy({ ...LK014, heat: { nominal_price_change_pct: 25, cpi_yoy_pct: 15, inquiries_change_pct: 30, rent_change_nominal_pct: 25 } });
  const cold = buildStrategy({ ...LK014, heat: { nominal_price_change_pct: 5, cpi_yoy_pct: 15, inquiries_change_pct: -30, rent_change_nominal_pct: 5 } });
  assert.equal(hot.heat.label, "Hot");
  assert.equal(cold.heat.label, "Cold");
  assert.ok(hot.pricing.list > cold.pricing.list);
  assert.ok(cold.pricing.list <= roundPrice(cold.compSet.median));
});

test("IK-203 market brief recommends lease with a dated trigger", () => {
  const brief = buildMarketBrief(IK203);
  close(brief.value, 393_300_000);
  assert.equal(brief.action, "Lease");
  assert.equal(brief.yields!.gross.toFixed(3), "0.081");
  assert.equal(brief.yields!.net.toFixed(3), "0.060");
  assert.equal(brief.totalReturn!.toFixed(3), "0.160");
  assert.equal(brief.breakevenAppreciation!.toFixed(3), "0.090");
  assert.ok(brief.supporting.length >= 3);
  assert.match(brief.counter, /Real prices are down 4\.3%/);
  const text = renderMarketBrief(brief, ctx);
  assert.match(text, /\*\*Lease\*\*/);
  assert.match(text, /below 9\.0%/);
});

test("campaign update at day 30 fires the price gate", () => {
  const plan = buildStrategy(LK014);
  const update = buildCampaignUpdate(plan, { as_of_date: "2026-11-11", inquiries: 50, qualified: 12, viewings: 6, offers: 0, price_objection_share_pct: 50 });
  const price = update.gates.find((g) => g.name === "Price")!;
  assert.equal(update.day, 30);
  assert.equal(price.fired, true);
  assert.equal(update.status, "Off track");
  assert.match(renderCampaignUpdate(plan, update, ctx), /Take the pre-approved step to ₦575M/);
});

test("formatting", () => {
  assert.equal(ngn(595_000_000), "₦595M");
  assert.equal(ngn(586_500_000), "₦586.5M");
  assert.equal(ngn(500_000), "₦500k");
  assert.equal(ngn(65_000), "₦65k");
  assert.equal(roundPrice(595_300_000), 595_000_000);
});
