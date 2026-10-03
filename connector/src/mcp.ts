import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createHash } from "node:crypto";
import { z } from "zod";
import { COSTS, type Config } from "./config.js";
import type { Account, Store } from "./store.js";
import { isValidDate } from "./engine/format.js";
import { buildStrategy, type StrategyInput, type StrategyPlan } from "./engine/strategy.js";
import { buildMarketBrief, type MarketBriefInput } from "./engine/marketBrief.js";
import { buildCampaignUpdate, campaignDay } from "./engine/campaign.js";
import {
  renderCampaignUpdate,
  renderMarketBrief,
  renderMarketBriefPreview,
  renderStrategy,
  renderStrategyPreview,
} from "./engine/render.js";

/** Finite numbers only: JSON 1e999 parses to Infinity, which must never reach a paid brief. */
const num = () => z.number().finite();
const money = () => num().positive().max(1e13);
/** Percentage changes: above -100% so real-terms maths never divides by zero. */
const change = () => num().gt(-100).max(1000);
const isoDate = () => z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isValidDate, "Not a real calendar date (YYYY-MM-DD)");
const text = (max: number) => z.string().max(max);

const comp = z.object({
  label: text(20).describe("Short id such as C1 (closed) or A1 (asking)"),
  description: text(120).describe("Type and size only, e.g. '5-bed detached, 450 sqm'. Never include addresses, owner or buyer names."),
  status: z.enum(["closed", "asking"]).describe("closed = completed sale price; asking = portal asking price"),
  date: text(20).optional().describe("Month of close or listing, e.g. 'Aug 2026'"),
  price_ngn: money(),
  adjustments_pct: num().min(-60).max(60).optional().describe("Sum of attribute adjustments to make the comp equivalent to the subject, in percent (e.g. 5 for +5%). Exclude the asking-to-close discount."),
  adjustment_note: text(80).optional(),
  source: text(40).optional().describe("e.g. 'Closed: internal', 'Closed: agent-reported', 'NPC asking'"),
  days_listed: z.number().int().nonnegative().max(10_000).optional(),
});

const heat = z
  .object({
    nominal_price_change_pct: change().optional().describe("12-month nominal price change for the segment, percent"),
    cpi_yoy_pct: change().optional().describe("NBS headline CPI year on year, percent"),
    dom_now: num().positive().max(10_000).optional().describe("Median days on market now"),
    dom_year_ago: num().positive().max(10_000).optional(),
    listings_now: z.number().int().nonnegative().max(1_000_000).optional().describe("Active deduplicated listings in the segment now"),
    listings_year_ago: z.number().int().positive().max(1_000_000).optional(),
    inquiries_change_pct: change().optional().describe("Qualified inquiries per listing, last 90 days vs prior 90, percent"),
    rent_change_nominal_pct: change().optional().describe("12-month nominal rent change, percent"),
  })
  .optional();

const audience = z.enum(["leadership", "client", "team"]);

const strategyShape = {
  audience: audience.default("leadership").describe("leadership = full economics; client = property owner (no fees); team = execution plan (no floor). Other versions of the same plan are free through audience_version."),
  transaction: z.enum(["sale", "lease"]).default("sale"),
  listing: z.object({
    id: text(40),
    district: text(80),
    type: text(60).describe("e.g. detached_duplex, flat, terrace, land"),
    bedrooms: z.number().int().positive().max(100).optional(),
    plot_sqm: num().positive().max(10_000_000).optional(),
    built_sqm: num().positive().max(10_000_000).optional(),
    title: text(60).describe("Exact title held, e.g. governors_consent, c_of_o, registered_deed, excision_gazette"),
    condition: text(40).optional(),
    amenities: z.array(text(60)).max(12).optional(),
    asking_price_ngn: money().describe("Owner's asking price (or annual rent for a lease)"),
    floor_price_ngn: money().optional().describe("Owner's minimum acceptable price"),
  }),
  comps: z.array(comp).min(1).max(30),
  list_to_close_discount_pct: num().min(-50).max(0).optional().describe("Median of close/list - 1 from the company's own deals, e.g. -8. Omit if unknown; never guess."),
  track_record: z
    .object({
      at_market_close_vs_list_pct: num().min(-60).max(60),
      at_market_dom: num().positive().max(10_000).optional(),
      at_market_n: z.number().int().positive().optional(),
      above_market_close_vs_list_pct: num().min(-60).max(60).optional(),
      above_market_dom: num().positive().max(10_000).optional(),
      above_market_n: z.number().int().positive().optional(),
    })
    .optional()
    .describe("Company's own outcomes for listings launched at vs above market"),
  heat,
  fx_ngn_per_usd: num().positive().max(1_000_000).optional().describe("CBN official rate, for the USD view"),
  segment_mix_pct: z
    .object({
      local: num().min(0).max(100).optional(),
      diaspora: num().min(0).max(100).optional(),
      investor: num().min(0).max(100).optional(),
      corporate: num().min(0).max(100).optional(),
      developer: num().min(0).max(100).optional(),
    })
    .optional()
    .describe("Share of qualified inquiries by segment for this price band, from the CRM"),
  funnel_rates: z
    .object({
      inquiry_to_qualified: num().min(0.001).max(1),
      qualified_to_viewing: num().min(0.001).max(1),
      viewing_to_offer: num().min(0.001).max(1),
      offer_to_close: num().min(0.001).max(1),
    })
    .optional()
    .describe("CRM conversion rates as fractions; omit to use labeled placeholders"),
  cost_per_qualified_lead_ngn: money().optional(),
  production_cost_ngn: num().nonnegative().max(1e12).optional(),
  events_cost_ngn: num().nonnegative().max(1e12).optional(),
  commission_rate_pct: num().min(0).max(20).optional(),
  budget_cap_ngn: money().optional(),
  launch_date: isoDate().describe("YYYY-MM-DD"),
  target_close_days: z.number().int().min(14).max(365).default(90),
  lease_fallback_rent_ngn_per_year: money().optional(),
  presenter: text(80).optional(),
};

const briefShape = {
  asset: z.object({
    id: text(40),
    district: text(80),
    type: text(60),
    bedrooms: z.number().int().positive().max(100).optional(),
    plot_sqm: num().positive().max(10_000_000).optional(),
    built_sqm: num().positive().max(10_000_000).optional(),
    title: text(60),
    status: text(40).optional(),
    asking_price_ngn: money().optional().describe("Only if the asset is currently listed for sale"),
    days_listed: z.number().int().nonnegative().max(10_000).optional().describe("Days on the market so far, if listed"),
  }),
  comps: z.array(comp).min(1).max(30),
  list_to_close_discount_pct: num().min(-50).max(0).optional(),
  heat,
  segment_median_dom: num().positive().max(10_000).optional().describe("Segment median days on market, for the reprice test"),
  rent_estimate_ngn_per_year: money().optional(),
  segment_median_gross_yield_pct: num().positive().max(50).optional(),
  service_charge_ngn_per_year: num().nonnegative().max(1e12).optional(),
  maintenance_ngn_per_year: num().nonnegative().max(1e12).optional(),
  vacancy_months: num().min(0).max(12).optional(),
  hurdle_rate_pct: num().min(0).max(100).optional(),
  owner_objective: z.enum(["liquidity", "return"]).optional(),
  as_of_date: isoDate(),
  review_date: isoDate().optional(),
};

const updateShape = {
  plan_id: text(40),
  as_of_date: isoDate().describe("Date the cumulative figures run to, after launch"),
  inquiries: z.number().int().nonnegative().max(1_000_000),
  qualified: z.number().int().nonnegative().max(1_000_000),
  viewings: z.number().int().nonnegative().max(1_000_000),
  offers: z.number().int().nonnegative().max(1_000_000),
  price_objection_share_pct: num().min(0).max(100).optional(),
  price_step_taken: z.boolean().optional(),
  spend_by_channel: z.array(z.object({ channel: text(60), spend_ngn: num().nonnegative().max(1e12), qualified: z.number().int().nonnegative().max(1_000_000) })).max(12).optional(),
  objections: z.array(z.object({ objection: text(80), share_pct: num().min(0).max(100) })).max(10).optional().describe("Top objections from viewing feedback, with the share of viewings citing each"),
};

function reply(body: string) {
  return { content: [{ type: "text" as const, text: body }] };
}

function errorReply(body: string) {
  return { content: [{ type: "text" as const, text: body }], isError: true };
}

/** Identifies a listing's inputs, ignoring which audience version was asked for. */
function strategyHash(input: StrategyInput): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical((value as Record<string, unknown>)[k])]));
    }
    return value;
  };
  const { presenter: _presenter, ...rest } = input as StrategyInput & { audience?: string };
  delete (rest as { audience?: string }).audience;
  return createHash("sha256").update(JSON.stringify(canonical(rest))).digest("hex");
}

/** Guards against a defect producing impossible numbers on a paid brief. */
function assertFinitePlan(plan: StrategyPlan): void {
  const prices = [plan.compSet.median, plan.compSet.min, plan.compSet.max, plan.premium, plan.pricing.list, plan.pricing.step, plan.pricing.floor, plan.outcomes.expectedClose];
  if (prices.some((v) => !Number.isFinite(v)) || plan.pricing.list <= 0) throw new Error("the inputs produce non-finite prices; check comp prices and adjustments");
  const { funnel: f, budget: b } = plan;
  const totals = [f.inquiries, f.qualified, f.viewings, f.offers, b.variable, b.total, b.partialTotal, b.feeRatio, ...plan.channels.flatMap((c) => [c.budget, c.inquiries])];
  if (totals.some((v) => v !== undefined && !Number.isFinite(v))) throw new Error("the inputs produce a non-finite funnel or budget; check funnel_rates and costs");
}

export function createMcpServer(account: Account, store: Store, config: Config): McpServer {
  const server = new McpServer({ name: "lagos-real-estate-brief", version: "1.1.0" });
  const buyUrl = () => `${config.baseUrl}/buy/${store.getOrCreateCheckout(account.id)}`;
  const balance = () => store.getAccount(account.id)?.credits ?? 0;
  const today = () => new Date();
  const packs = () => config.packs.map((p) => `${p.name}: ${p.credits} credits for ₦${(p.price_kobo / 100).toLocaleString("en-US")}`).join("; ");
  const needCredits = (what: string, cost: number, previewUsed: boolean) =>
    reply(
      `${previewUsed ? "Your free preview has been used. " : ""}This ${what} needs ${cost} credit${cost === 1 ? "" : "s"} (balance: ${balance()}).\n\nBuy credits: ${buyUrl()}\n\nAfter paying, ask Claude to run it again. Packs: ${packs()}.`,
    );

  server.registerTool(
    "account_status",
    {
      title: "Account status",
      description: "Show the credit balance, whether the free preview is still available, what each tool costs, and a link to buy credits.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const a = store.getAccount(account.id)!;
      const preview = store.previewAvailable(account.id)
        ? "available. It is used only when you run marketing_strategy or market_brief with too few credits for the full result; with enough credits you get the full result instead."
        : "used";
      return reply(
        [
          `Credits: ${a.credits}`,
          `Free preview: ${preview}`,
          `Costs: marketing_strategy ${COSTS.marketing_strategy} credits (one charge per listing covers all three audience versions, and re-running the same inputs within 30 days is free), market_brief ${COSTS.market_brief}, campaign_update ${COSTS.campaign_update}, audience_version free for your saved plans.`,
          `Buy credits: ${buyUrl()}`,
        ].join("\n"),
      );
    },
  );

  server.registerTool(
    "buy_credits",
    {
      title: "Buy credits",
      description: "Return a secure Paystack checkout link (naira: card, bank transfer, USSD) to buy credits. Give the link to the user to open.",
      annotations: { readOnlyHint: true },
    },
    async () => reply(`Open this link to buy credits (valid for at least 1 hour): ${buyUrl()}\n\nAfter paying, ask Claude to continue.`),
  );

  server.registerTool(
    "marketing_strategy",
    {
      title: "Listing marketing strategy",
      description:
        "Compute a presentation-ready Lagos listing marketing strategy: price position vs adjusted comps, list price, floor, negotiation band, pre-agreed price step, target segments, channel plan, budget, back-solved funnel, dated review gates, risks, compliance, comps appendix, and presenter notes. All arithmetic is computed server-side. Call it ONCE per listing; get the other audience versions with audience_version (free). Pass only figures the user supplied or that come from their files; omit unknown fields rather than guessing. With too few credits, a new account's first call returns a free preview (diagnosis only). Returns a plan_id. Relay the returned brief to the user without changing any number.",
      inputSchema: strategyShape,
    },
    async (args) => {
      const input = args as StrategyInput;
      let plan: StrategyPlan;
      try {
        plan = buildStrategy(input);
        assertFinitePlan(plan);
      } catch (err) {
        return errorReply(`Could not compute the strategy: ${(err as Error).message}. Nothing was charged.`);
      }
      const hash = strategyHash(input);
      const existing = store.findRecentPlan(account.id, hash);
      if (existing) {
        const body = renderStrategy(plan, args.audience, { asOf: today(), planId: existing.id });
        return reply(`${body}\n\n_Same inputs as plan ${existing.id}: no charge. Balance: ${balance()}._`);
      }
      const cost = COSTS.marketing_strategy;
      if (store.charge(account.id, cost, "marketing_strategy", args.listing.id)) {
        const planId = store.savePlan(account.id, args.listing.id, input, hash);
        const body = renderStrategy(plan, args.audience, { asOf: today(), planId });
        return reply(`${body}\n\n_Charged ${cost} credits. Balance: ${balance()}. Other versions of this plan are free: call audience_version with plan_id ${planId}._`);
      }
      if (store.claimPreview(account.id)) {
        return reply(renderStrategyPreview(plan, { asOf: today(), unlockUrl: buyUrl(), creditCost: cost }));
      }
      return needCredits("marketing strategy", cost, true);
    },
  );

  server.registerTool(
    "audience_version",
    {
      title: "Re-cut a saved strategy for another audience",
      description: "Render a saved marketing strategy (from marketing_strategy) for leadership, client (property owner), or team. Free for plans you already paid for.",
      inputSchema: { plan_id: text(40), audience },
      annotations: { readOnlyHint: true },
    },
    async ({ plan_id, audience: aud }) => {
      const stored = store.getPlan(account.id, plan_id);
      if (!stored) return errorReply("Plan not found for this account. Run marketing_strategy first.");
      const plan = buildStrategy(JSON.parse(stored.input_json) as StrategyInput);
      return reply(renderStrategy(plan, aud, { asOf: today(), planId: plan_id }));
    },
  );

  server.registerTool(
    "market_brief",
    {
      title: "Hold / sell / lease market brief",
      description:
        "Compute a hold, sell, lease, or reprice decision brief for a Lagos property: adjusted comps, yields, total return vs hurdle, heat score, one recommended action with supporting signals, the strongest counter-signal, and a dated re-test trigger. Pass only supplied figures. With too few credits, a new account's first call returns a free preview (snapshot only).",
      inputSchema: briefShape,
    },
    async (args) => {
      let brief;
      try {
        brief = buildMarketBrief(args as MarketBriefInput);
        if (!Number.isFinite(brief.value) || brief.value <= 0) throw new Error("the comps produce a non-finite value");
      } catch (err) {
        return errorReply(`Could not compute the brief: ${(err as Error).message}. Nothing was charged.`);
      }
      const cost = COSTS.market_brief;
      if (store.charge(account.id, cost, "market_brief", args.asset.id)) {
        return reply(`${renderMarketBrief(brief, { asOf: today() })}\n\n_Charged ${cost} credits. Balance: ${balance()}._`);
      }
      if (store.claimPreview(account.id)) {
        return reply(renderMarketBriefPreview(brief, { asOf: today(), unlockUrl: buyUrl(), creditCost: cost }));
      }
      return needCredits("market brief", cost, true);
    },
  );

  server.registerTool(
    "campaign_update",
    {
      title: "Weekly campaign update",
      description: "Compare cumulative campaign actuals to a saved plan's targets, check each review gate, and report status (On track / At risk / Off track) with the pre-agreed action. Use after launch. Costs credits.",
      inputSchema: updateShape,
    },
    async (args) => {
      const stored = store.getPlan(account.id, args.plan_id);
      if (!stored) return errorReply("Plan not found for this account. Run marketing_strategy first.");
      const plan = buildStrategy(JSON.parse(stored.input_json) as StrategyInput);
      if (campaignDay(plan, args.as_of_date) <= 0) {
        return errorReply(`The campaign launches on ${plan.input.launch_date}; updates start the day after launch. Nothing was charged.`);
      }
      const cost = COSTS.campaign_update;
      if (!store.charge(account.id, cost, "campaign_update", args.plan_id)) return needCredits("campaign update", cost, false);
      const update = buildCampaignUpdate(plan, args);
      return reply(`${renderCampaignUpdate(plan, update, { asOf: today(), planId: args.plan_id })}\n\n_Charged ${cost} credit. Balance: ${balance()}._`);
    },
  );

  server.registerTool(
    "rotate_connector_url",
    {
      title: "Replace my connector URL",
      description: "Issue a new connector URL and disable the current one immediately (use if the URL leaked). The user must paste the new URL into Claude's connector settings. Confirm with the user before calling.",
      annotations: { destructiveHint: true },
    },
    async () => {
      const token = store.rotateToken(account.id);
      return reply(`Your new connector URL (shown once; the old one no longer works):\n\n${config.baseUrl}/mcp/${token}\n\nIn Claude, open Settings > Connectors, remove the old Lagos Brief connector, and add this URL.`);
    },
  );

  server.registerTool(
    "delete_my_data",
    {
      title: "Delete saved plans",
      description: "Permanently delete every saved plan (listing inputs) for this account. Credits are kept. Confirm with the user before calling.",
      annotations: { destructiveHint: true },
    },
    async () => reply(`Deleted ${store.deletePlans(account.id)} saved plans. Credits are unchanged.`),
  );

  return server;
}
