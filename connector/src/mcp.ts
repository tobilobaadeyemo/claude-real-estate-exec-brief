import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { COSTS, type Config } from "./config.js";
import type { Account, Store } from "./store.js";
import { buildStrategy, type StrategyInput } from "./engine/strategy.js";
import { buildMarketBrief, type MarketBriefInput } from "./engine/marketBrief.js";
import { buildCampaignUpdate } from "./engine/campaign.js";
import {
  renderCampaignUpdate,
  renderMarketBrief,
  renderMarketBriefPreview,
  renderStrategy,
  renderStrategyPreview,
} from "./engine/render.js";

const comp = z.object({
  label: z.string().max(20).describe("Short id such as C1 (closed) or A1 (asking)"),
  description: z.string().max(120).describe("Type and size only, e.g. '5-bed detached, 450 sqm'. Never include addresses, owner or buyer names."),
  status: z.enum(["closed", "asking"]).describe("closed = completed sale price; asking = portal asking price"),
  date: z.string().max(20).optional().describe("Month of close or listing, e.g. 'Aug 2026'"),
  price_ngn: z.number().positive(),
  adjustments_pct: z.number().min(-60).max(60).optional().describe("Sum of attribute adjustments to make the comp equivalent to the subject, in percent (e.g. 5 for +5%). Exclude the asking-to-close discount."),
  adjustment_note: z.string().max(80).optional(),
  source: z.string().max(40).optional().describe("e.g. 'Closed: internal', 'Closed: agent-reported', 'NPC asking'"),
  days_listed: z.number().int().nonnegative().optional(),
});

const heat = z
  .object({
    nominal_price_change_pct: z.number().optional().describe("12-month nominal price change for the segment, percent"),
    cpi_yoy_pct: z.number().optional().describe("NBS headline CPI year on year, percent"),
    dom_now: z.number().positive().optional().describe("Median days on market now"),
    dom_year_ago: z.number().positive().optional(),
    listings_now: z.number().int().nonnegative().optional().describe("Active deduplicated listings in the segment now"),
    listings_year_ago: z.number().int().positive().optional(),
    inquiries_change_pct: z.number().optional().describe("Qualified inquiries per listing, last 90 days vs prior 90, percent"),
    rent_change_nominal_pct: z.number().optional().describe("12-month nominal rent change, percent"),
  })
  .optional();

const audience = z.enum(["leadership", "client", "team"]);

const strategyShape = {
  audience: audience.default("leadership").describe("leadership = full economics; client = property owner (no fees); team = execution plan (no floor)"),
  transaction: z.enum(["sale", "lease"]).default("sale"),
  listing: z.object({
    id: z.string().max(40),
    district: z.string().max(80),
    type: z.string().max(60).describe("e.g. detached_duplex, flat, terrace, land"),
    bedrooms: z.number().int().positive().optional(),
    plot_sqm: z.number().positive().optional(),
    built_sqm: z.number().positive().optional(),
    title: z.string().max(60).describe("Exact title held, e.g. governors_consent, c_of_o, registered_deed, excision_gazette"),
    condition: z.string().max(40).optional(),
    amenities: z.array(z.string().max(60)).max(12).optional(),
    asking_price_ngn: z.number().positive().describe("Owner's asking price (or annual rent for a lease)"),
    floor_price_ngn: z.number().positive().optional().describe("Owner's minimum acceptable price"),
  }),
  comps: z.array(comp).min(1).max(30),
  list_to_close_discount_pct: z.number().min(-50).max(0).optional().describe("Median of close/list - 1 from the company's own deals, e.g. -8. Omit if unknown; never guess."),
  track_record: z
    .object({
      at_market_close_vs_list_pct: z.number(),
      at_market_dom: z.number().positive().optional(),
      at_market_n: z.number().int().positive().optional(),
      above_market_close_vs_list_pct: z.number().optional(),
      above_market_dom: z.number().positive().optional(),
      above_market_n: z.number().int().positive().optional(),
    })
    .optional()
    .describe("Company's own outcomes for listings launched at vs above market"),
  heat,
  fx_ngn_per_usd: z.number().positive().optional().describe("CBN official rate, for the USD view"),
  segment_mix_pct: z
    .object({
      local: z.number().min(0).max(100).optional(),
      diaspora: z.number().min(0).max(100).optional(),
      investor: z.number().min(0).max(100).optional(),
      corporate: z.number().min(0).max(100).optional(),
      developer: z.number().min(0).max(100).optional(),
    })
    .optional()
    .describe("Share of qualified inquiries by segment for this price band, from the CRM"),
  funnel_rates: z
    .object({
      inquiry_to_qualified: z.number().gt(0).max(1),
      qualified_to_viewing: z.number().gt(0).max(1),
      viewing_to_offer: z.number().gt(0).max(1),
      offer_to_close: z.number().gt(0).max(1),
    })
    .optional()
    .describe("CRM conversion rates as fractions; omit to use labeled placeholders"),
  cost_per_qualified_lead_ngn: z.number().positive().optional(),
  production_cost_ngn: z.number().nonnegative().optional(),
  events_cost_ngn: z.number().nonnegative().optional(),
  commission_rate_pct: z.number().min(0).max(20).optional(),
  budget_cap_ngn: z.number().positive().optional(),
  launch_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD"),
  target_close_days: z.number().int().min(14).max(365).default(90),
  lease_fallback_rent_ngn_per_year: z.number().positive().optional(),
  presenter: z.string().max(80).optional(),
};

const briefShape = {
  asset: z.object({
    id: z.string().max(40),
    district: z.string().max(80),
    type: z.string().max(60),
    bedrooms: z.number().int().positive().optional(),
    plot_sqm: z.number().positive().optional(),
    built_sqm: z.number().positive().optional(),
    title: z.string().max(60),
    status: z.string().max(40).optional(),
    asking_price_ngn: z.number().positive().optional().describe("Only if the asset is currently listed for sale"),
  }),
  comps: z.array(comp).min(1).max(30),
  list_to_close_discount_pct: z.number().min(-50).max(0).optional(),
  heat,
  rent_estimate_ngn_per_year: z.number().positive().optional(),
  segment_median_gross_yield_pct: z.number().positive().max(50).optional(),
  service_charge_ngn_per_year: z.number().nonnegative().optional(),
  maintenance_ngn_per_year: z.number().nonnegative().optional(),
  vacancy_months: z.number().min(0).max(12).optional(),
  hurdle_rate_pct: z.number().min(0).max(100).optional(),
  owner_objective: z.enum(["liquidity", "return"]).optional(),
  as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  review_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
};

const updateShape = {
  plan_id: z.string().max(40),
  as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  inquiries: z.number().int().nonnegative(),
  qualified: z.number().int().nonnegative(),
  viewings: z.number().int().nonnegative(),
  offers: z.number().int().nonnegative(),
  price_objection_share_pct: z.number().min(0).max(100).optional(),
  price_step_taken: z.boolean().optional(),
  spend_by_channel: z.array(z.object({ channel: z.string().max(60), spend_ngn: z.number().nonnegative(), qualified: z.number().int().nonnegative() })).max(12).optional(),
};

function text(body: string) {
  return { content: [{ type: "text" as const, text: body }] };
}

function errorText(body: string) {
  return { content: [{ type: "text" as const, text: body }], isError: true };
}

export function createMcpServer(account: Account, store: Store, config: Config): McpServer {
  const server = new McpServer({ name: "lagos-real-estate-brief", version: "1.0.0" });
  const unlockUrl = () => `${config.baseUrl}/buy/${store.createCheckout(account.id)}`;
  const balance = () => store.getAccount(account.id)?.credits ?? 0;
  const today = () => new Date();
  const locked = (what: string, cost: number) =>
    text(
      `Your free preview has been used, and this ${what} needs ${cost} credits (balance: ${balance()}).\n\nBuy credits: ${unlockUrl()}\n\nAfter paying, ask Claude to run it again. Packs: ${config.packs.map((p) => `${p.name}: ${p.credits} credits for ₦${(p.price_kobo / 100).toLocaleString("en-US")}`).join("; ")}.`,
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
      return text(
        [
          `Credits: ${a.credits}`,
          `Free preview: ${a.preview_used ? "used" : "available (one marketing_strategy or market_brief preview)"}`,
          `Costs: marketing_strategy ${COSTS.marketing_strategy} credits (all three audience versions included), market_brief ${COSTS.market_brief}, campaign_update ${COSTS.campaign_update}, audience_version free for your saved plans.`,
          `Buy credits: ${unlockUrl()}`,
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
    async () => text(`Open this link to buy credits (valid 24 hours): ${unlockUrl()}\n\nAfter paying, ask Claude to continue.`),
  );

  server.registerTool(
    "marketing_strategy",
    {
      title: "Listing marketing strategy",
      description:
        "Compute a presentation-ready Lagos listing marketing strategy: price position vs adjusted comps, list price, floor, negotiation band, pre-agreed price step, target segments, channel plan, budget, back-solved funnel, dated review gates, risks, compliance, comps appendix, and presenter notes. All arithmetic is computed server-side. Pass only figures the user supplied or that come from their files; omit unknown fields rather than guessing. The first call on a new account returns a free preview (diagnosis only); full results cost credits. Returns a plan_id for audience_version and campaign_update. Relay the returned brief to the user without changing any number.",
      inputSchema: strategyShape,
    },
    async (args) => {
      let plan;
      try {
        plan = buildStrategy(args as StrategyInput);
      } catch (err) {
        return errorText(`Could not compute the strategy: ${(err as Error).message}`);
      }
      const cost = COSTS.marketing_strategy;
      if (store.charge(account.id, cost, "marketing_strategy", args.listing.id)) {
        const planId = store.savePlan(account.id, args.listing.id, args);
        const body = renderStrategy(plan, args.audience, { asOf: today(), planId });
        return text(`${body}\n\n_Charged ${cost} credits. Balance: ${balance()}. Other versions of this plan are free: call audience_version with plan_id ${planId}._`);
      }
      if (store.claimPreview(account.id)) {
        return text(renderStrategyPreview(plan, { asOf: today(), unlockUrl: unlockUrl(), creditCost: cost }));
      }
      return locked("marketing strategy", cost);
    },
  );

  server.registerTool(
    "audience_version",
    {
      title: "Re-cut a saved strategy for another audience",
      description: "Render a saved marketing strategy (from marketing_strategy) for leadership, client (property owner), or team. Free for plans you already paid for.",
      inputSchema: { plan_id: z.string().max(40), audience },
      annotations: { readOnlyHint: true },
    },
    async ({ plan_id, audience: aud }) => {
      const stored = store.getPlan(account.id, plan_id);
      if (!stored) return errorText("Plan not found for this account. Run marketing_strategy first.");
      const plan = buildStrategy(JSON.parse(stored.input_json) as StrategyInput);
      return text(renderStrategy(plan, aud, { asOf: today(), planId: plan_id }));
    },
  );

  server.registerTool(
    "market_brief",
    {
      title: "Hold / sell / lease market brief",
      description:
        "Compute a hold, sell, lease, or reprice decision brief for a Lagos property: adjusted comps, yields, total return vs hurdle, heat score, one recommended action with 3+ supporting signals, the strongest counter-signal, and a dated re-test trigger. Pass only supplied figures. First call on a new account returns a free preview (snapshot only); full results cost credits.",
      inputSchema: briefShape,
    },
    async (args) => {
      let brief;
      try {
        brief = buildMarketBrief(args as MarketBriefInput);
      } catch (err) {
        return errorText(`Could not compute the brief: ${(err as Error).message}`);
      }
      const cost = COSTS.market_brief;
      if (store.charge(account.id, cost, "market_brief", args.asset.id)) {
        return text(`${renderMarketBrief(brief, { asOf: today() })}\n\n_Charged ${cost} credits. Balance: ${balance()}._`);
      }
      if (store.claimPreview(account.id)) {
        return text(renderMarketBriefPreview(brief, { asOf: today(), unlockUrl: unlockUrl(), creditCost: cost }));
      }
      return locked("market brief", cost);
    },
  );

  server.registerTool(
    "campaign_update",
    {
      title: "Weekly campaign update",
      description: "Compare cumulative campaign actuals to a saved plan's targets, check each review gate, and report status (On track / At risk / Off track) with the pre-agreed action. Costs credits.",
      inputSchema: updateShape,
    },
    async (args) => {
      const stored = store.getPlan(account.id, args.plan_id);
      if (!stored) return errorText("Plan not found for this account. Run marketing_strategy first.");
      const plan = buildStrategy(JSON.parse(stored.input_json) as StrategyInput);
      const cost = COSTS.campaign_update;
      if (!store.charge(account.id, cost, "campaign_update", args.plan_id)) return locked("campaign update", cost);
      const update = buildCampaignUpdate(plan, args);
      return text(`${renderCampaignUpdate(plan, update, { asOf: today(), planId: args.plan_id })}\n\n_Charged ${cost} credit. Balance: ${balance()}._`);
    },
  );

  server.registerTool(
    "delete_my_data",
    {
      title: "Delete saved plans",
      description: "Permanently delete every saved plan (listing inputs) for this account. Credits are kept. Confirm with the user before calling.",
      annotations: { destructiveHint: true },
    },
    async () => text(`Deleted ${store.deletePlans(account.id)} saved plans. Credits are unchanged.`),
  );

  return server;
}
