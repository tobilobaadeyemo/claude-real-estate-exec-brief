/**
 * Regression tests for the pre-launch audit findings (payments, abuse, metering, engine, ops).
 * Each test names the finding ids it covers.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "../src/server.js";
import { Store } from "../src/store.js";
import { DEFAULT_PACKS, loadConfig, type Config } from "../src/config.js";
import type { PaystackClient, VerifiedTransaction } from "../src/paystack.js";
import { bandAdjust, buildStrategy, flagsFor } from "../src/engine/strategy.js";
import { buildMarketBrief } from "../src/engine/marketBrief.js";
import { buildCampaignUpdate } from "../src/engine/campaign.js";
import { renderCampaignUpdate, renderStrategy, renderStrategyPreview } from "../src/engine/render.js";
import { ngn, parseDate, usd } from "../src/engine/format.js";
import { priceBand } from "../src/engine/market.js";
import { IK203, LK014 } from "./fixtures.js";

const SECRET = "sk_test_hardening";
let server: Server;
let base: string;
let store: Store;
const verified = new Map<string, VerifiedTransaction>();
let verifyCalls = 0;
const config: Config = { port: 0, baseUrl: "", databasePath: ":memory:", paystackSecretKey: SECRET, paystackBaseUrl: "", keyMode: "test", packs: DEFAULT_PACKS, trustProxy: 0, supportEmail: "help@example.com" };

const paystack: PaystackClient = {
  async initialize(p) {
    verified.set(p.reference, { status: "success", amount: p.amountKobo, currency: "NGN", reference: p.reference, domain: "test" });
    return { authorizationUrl: `https://checkout.paystack.com/fake/${p.reference}` };
  },
  async verify(reference) {
    verifyCalls++;
    const tx = verified.get(reference);
    if (!tx) throw new Error("unknown reference");
    return tx;
  },
};

before(async () => {
  store = new Store(":memory:");
  const app = createApp({ config, store, paystack });
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  config.baseUrl = base;
});

after(() => {
  server.close();
  store.close();
});

const ctx = { asOf: new Date(Date.UTC(2026, 9, 3)), planId: "pln_test" };

async function signup(email = "agent@example.com"): Promise<{ url: string; token: string }> {
  const res = await fetch(`${base}/signup`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `email=${encodeURIComponent(email)}` });
  const url = /(http:\/\/127\.0\.0\.1:\d+\/mcp\/[A-Za-z0-9_-]+)/.exec(await res.text())![1];
  return { url, token: url.split("/mcp/")[1] };
}

async function connect(url: string): Promise<Client> {
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  return client;
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  return (result.content as { type: string; text: string }[]).map((c) => c.text).join("\n");
}

function signed(body: string, secret = SECRET) {
  return { "content-type": "application/json", "x-paystack-signature": createHmac("sha512", secret).update(body).digest("hex") };
}

async function webhook(payload: object): Promise<number> {
  const raw = JSON.stringify(payload);
  return (await fetch(`${base}/paystack/webhook`, { method: "POST", headers: signed(raw), body: raw })).status;
}

function accountOf(token: string) {
  return store.findByToken(token)!;
}

// --- Payments ---------------------------------------------------------------------------------

test("payments-1 / deploy-3: fees passed to the customer still credit the pack", () => {
  const { account } = store.createAccount("fees@example.com");
  const p = store.createPayment(account.id, DEFAULT_PACKS[0], "test");
  const result = store.settlePayment(p.reference, { amount: p.amount_kobo + 32_500, requestedAmount: p.amount_kobo, currency: "NGN", domain: "test" }, "test");
  assert.equal(result, "credited");
  assert.equal(store.getAccount(account.id)!.credits, 3);
});

test("payments-1 / deploy-4: a mismatch is held for review, never terminal, and can be settled later", () => {
  const { account } = store.createAccount("short@example.com");
  const p = store.createPayment(account.id, DEFAULT_PACKS[1], "test");
  assert.equal(store.settlePayment(p.reference, { amount: 100, currency: "NGN" }, "test"), "review");
  assert.equal(store.getPayment(p.reference)!.status, "review");
  assert.match(store.getPayment(p.reference)!.review_reason!, /requested 100 kobo/);
  assert.equal(store.settlePayment(p.reference, { amount: p.amount_kobo, currency: "NGN" }, "test"), "credited");
  assert.equal(store.getAccount(account.id)!.credits, 10);
  assert.equal(store.settlePayment(p.reference, { amount: p.amount_kobo, currency: "NGN" }, "test"), "already");
});

test("payments-2 / deploy-2: test payments are refused on live keys and voided when going live", () => {
  const { account } = store.createAccount("mode@example.com");
  const p1 = store.createPayment(account.id, DEFAULT_PACKS[0], "test");
  assert.equal(store.settlePayment(p1.reference, { amount: p1.amount_kobo, currency: "NGN", domain: "test" }, "test"), "credited");
  const p2 = store.createPayment(account.id, DEFAULT_PACKS[0], "live");
  assert.equal(store.settlePayment(p2.reference, { amount: p2.amount_kobo, currency: "NGN", domain: "test" }, "live"), "review");
  assert.equal(store.getAccount(account.id)!.credits, 3);
  assert.ok(store.voidTestCredits() >= 1);
  assert.equal(store.getAccount(account.id)!.credits, 0);
  assert.equal(store.getPayment(p1.reference)!.status, "voided");
});

test("payments-4: refund and chargeback webhooks take the credits back", async () => {
  const { account } = store.createAccount("refund@example.com");
  const p = store.createPayment(account.id, DEFAULT_PACKS[1], "test");
  store.settlePayment(p.reference, { amount: p.amount_kobo, currency: "NGN" }, "test");
  store.charge(account.id, 4, "test");
  assert.equal(await webhook({ event: "refund.processed", data: { transaction_reference: p.reference } }), 200);
  assert.equal(store.getPayment(p.reference)!.status, "reversed");
  assert.equal(store.getAccount(account.id)!.credits, 0);
  assert.equal(await webhook({ event: "refund.processed", data: { transaction_reference: p.reference } }), 200);
  const p2 = store.createPayment(account.id, DEFAULT_PACKS[0], "test");
  store.settlePayment(p2.reference, { amount: p2.amount_kobo, currency: "NGN" }, "test");
  assert.equal(await webhook({ event: "charge.dispute.create", data: { transaction: { reference: p2.reference } } }), 200);
  assert.equal(store.getPayment(p2.reference)!.status, "disputed");
  assert.equal(store.getAccount(account.id)!.credits, 0);
  assert.equal(await webhook({ event: "charge.dispute.resolve", data: { resolution: "declined", transaction: { reference: p2.reference } } }), 200);
  assert.equal(store.getPayment(p2.reference)!.status, "paid");
  assert.equal(store.getAccount(account.id)!.credits, 3, "merchant won: credits restored");
  assert.equal(await webhook({ event: "charge.dispute.create", data: { transaction: { reference: p2.reference } } }), 200);
  assert.equal(await webhook({ event: "charge.dispute.resolve", data: { resolution: "merchant-accepted", transaction: { reference: p2.reference } } }), 200);
  assert.equal(store.getPayment(p2.reference)!.status, "reversed");
  assert.equal(store.getAccount(account.id)!.credits, 0);
});

test("fix-review payments-3: partial refunds remove credits in proportion, rounded in the buyer's favour", () => {
  const { account } = store.createAccount("partial@example.com");
  const agency = DEFAULT_PACKS[2];
  const p = store.createPayment(account.id, agency, "test");
  store.settlePayment(p.reference, { amount: agency.price_kobo, currency: "NGN" }, "test");
  assert.equal(store.refundPayment(p.reference, 200_000).removed, 0, "a ₦2,000 goodwill refund removes no credits");
  assert.equal(store.getAccount(account.id)!.credits, 40);
  assert.equal(store.refundPayment(p.reference, 7_800_000).removed, 20, "half refunded in total: half the credits");
  assert.equal(store.getPayment(p.reference)!.status, "paid");
  assert.equal(store.refundPayment(p.reference, 8_000_000).status, "refunded");
  assert.equal(store.getAccount(account.id)!.credits, 0);
  assert.equal(store.getPayment(p.reference)!.status, "reversed");
});

test("payments-7 / security-3: /paid shows only this payment's credits and throttles Paystack calls", async () => {
  const { account } = store.createAccount("paid@example.com");
  store.grant(account.id, 37, "seed");
  const p = store.createPayment(account.id, DEFAULT_PACKS[0], "test");
  verified.set(p.reference, { status: "abandoned", amount: p.amount_kobo, currency: "NGN", reference: p.reference });
  const before = verifyCalls;
  for (let i = 0; i < 5; i++) await fetch(`${base}/paid?reference=${p.reference}`);
  assert.equal(verifyCalls - before, 1, "only one Paystack verify per 30 seconds per payment");
  verified.set(p.reference, { status: "success", amount: p.amount_kobo, currency: "NGN", reference: p.reference });
  store.db.prepare("UPDATE payments SET last_verified_at = NULL WHERE reference = ?").run(p.reference);
  const body = await (await fetch(`${base}/paid?reference=${p.reference}`)).text();
  assert.match(body, /3 credits added/);
  assert.doesNotMatch(body, /40|balance/i);
});

test("payments-9: unsigned or non-JSON webhook bodies get 401, not a crash", async () => {
  const plain = await fetch(`${base}/paystack/webhook`, { method: "POST", headers: { "content-type": "text/plain" }, body: "hello" });
  assert.equal(plain.status, 401);
  const none = await fetch(`${base}/paystack/webhook`, { method: "POST" });
  assert.equal(none.status, 401);
});

test("payments-10 / deploy-7 / deploy-8 / security-4: config validation", () => {
  assert.throws(() => loadConfig({ CREDIT_PACKS: '[{"id":"a","credits":3,"price_kobo":1500000}]' }), /name/);
  assert.throws(() => loadConfig({ CREDIT_PACKS: '[{"id":"a","name":"A","credits":3,"price_kobo":1500000},{"id":"a","name":"B","credits":5,"price_kobo":2500000}]' }), /Duplicate/);
  assert.throws(() => loadConfig({ CREDIT_PACKS: "not json" }), /valid JSON/);
  assert.throws(() => loadConfig({ CREDIT_PACKS: '[{"id":"a","name":"A","credits":3,"price_kobo":1}]' }), /price_kobo/);
  assert.throws(() => loadConfig({ NODE_ENV: "production", PAYSTACK_SECRET_KEY: "sk_live_x1" }), /PUBLIC_BASE_URL is required/);
  assert.throws(() => loadConfig({ NODE_ENV: "production", PAYSTACK_SECRET_KEY: "sk_live_x1", PUBLIC_BASE_URL: "brief.example.com" }), /full URL/);
  assert.throws(() => loadConfig({ NODE_ENV: "production", PAYSTACK_SECRET_KEY: "sk_live_x1", PUBLIC_BASE_URL: "http://brief.example.com" }), /https/);
  assert.equal(loadConfig({ NODE_ENV: "production", PAYSTACK_SECRET_KEY: "sk_live_x1", PUBLIC_BASE_URL: "https://brief.example.com/" }).keyMode, "live");
  assert.equal(loadConfig({ TRUST_PROXY: "3" }).trustProxy, 3);
  assert.equal(loadConfig({ TRUST_PROXY: "true" }).trustProxy, 1);
  assert.throws(() => loadConfig({ TRUST_PROXY: "lots" }), /hops/);
});

// --- Abuse ------------------------------------------------------------------------------------

test("security-1 / mcp-1 / payments-3: buy links are reused per account and batches are refused", async () => {
  const { url, token } = await signup("batch@example.com");
  const client = await connect(url);
  for (let i = 0; i < 5; i++) await client.callTool({ name: "account_status", arguments: {} });
  await client.callTool({ name: "buy_credits", arguments: {} });
  const rows = store.db.prepare("SELECT COUNT(*) AS n FROM checkouts WHERE account_id = ?").get(accountOf(token).id) as { n: number };
  assert.equal(rows.n, 1);
  const batch = Array.from({ length: 3 }, (_, i) => ({ jsonrpc: "2.0", id: i + 1, method: "tools/call", params: { name: "account_status", arguments: {} } }));
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify(batch) });
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { error: { code: number } }).error.code, -32600);
  store.db.prepare("UPDATE checkouts SET expires_at = '2000-01-01T00:00:00.000Z'").run();
  assert.ok(store.purgeExpired() >= 1);
  await client.close();
});

test("mcp-9: malformed JSON gets a JSON-RPC parse error", async () => {
  const { url } = await signup("badjson@example.com");
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: "{bad" });
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { error: { code: number } }).error.code, -32700);
});

test("security-2 / mcp-3: unknown tokens are refused before any per-token state or body parsing", async () => {
  const res = await fetch(`${base}/mcp/${"x".repeat(40)}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{bad" });
  assert.equal(res.status, 401);
});

// --- Metering ---------------------------------------------------------------------------------

test("mcp-2: one charge per listing; other audiences and re-runs are free", async () => {
  const { url, token } = await signup("idem@example.com");
  store.grant(accountOf(token).id, 10, "seed");
  const client = await connect(url);
  const args = (audience: string) => ({ ...LK014, audience }) as unknown as Record<string, unknown>;
  const first = textOf(await client.callTool({ name: "marketing_strategy", arguments: args("leadership") }));
  assert.match(first, /Charged 3 credits/);
  const second = textOf(await client.callTool({ name: "marketing_strategy", arguments: args("client") }));
  assert.match(second, /no charge/);
  assert.doesNotMatch(second, /expected fee/i);
  assert.equal(store.getAccount(accountOf(token).id)!.credits, 7);
  await client.close();
});

test("mcp-4 / engine-15: campaign_update before launch is refused without charge", async () => {
  const { url, token } = await signup("early@example.com");
  store.grant(accountOf(token).id, 5, "seed");
  const client = await connect(url);
  const full = textOf(await client.callTool({ name: "marketing_strategy", arguments: { ...LK014, audience: "team" } as unknown as Record<string, unknown> }));
  const planId = /plan_id (pln_[A-Za-z0-9_-]+)/.exec(full)![1];
  const early = await client.callTool({ name: "campaign_update", arguments: { plan_id: planId, as_of_date: "2026-10-12", inquiries: 0, qualified: 0, viewings: 0, offers: 0 } });
  assert.equal(early.isError, true);
  assert.equal(store.getAccount(accountOf(token).id)!.credits, 2);
  await client.close();
});

test("mcp-5 / engine-20: impossible dates and non-finite numbers are rejected before charging", async () => {
  const { url, token } = await signup("dates@example.com");
  store.grant(accountOf(token).id, 5, "seed");
  const client = await connect(url);
  const bad = await client.callTool({ name: "marketing_strategy", arguments: { ...LK014, launch_date: "2026-02-30" } as unknown as Record<string, unknown> });
  assert.equal(bad.isError, true);
  const raw = JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "marketing_strategy", arguments: { ...LK014, comps: [{ ...LK014.comps[0], price_ngn: "__INF__" }] } } }).replace('"__INF__"', "1e999");
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: raw });
  const text = await res.text();
  assert.match(text, /isError|error/);
  assert.equal(store.getAccount(accountOf(token).id)!.credits, 5);
  assert.throws(() => parseDate("2026-13-45"));
  await client.close();
});

test("mcp-6 / engine-1: the preview and the client version never show fee ratios", () => {
  const plan = buildStrategy({ ...LK014, cost_per_qualified_lead_ngn: 400_000, budget_cap_ngn: 5_000_000 });
  assert.ok(plan.budget.overGuardrail);
  const preview = renderStrategyPreview(plan, { ...ctx, unlockUrl: "https://x/buy/1" });
  assert.doesNotMatch(preview, /expected fee|guardrail|cap/i);
  for (const audience of ["client", "team"] as const) assert.doesNotMatch(renderStrategy(plan, audience, ctx), /guardrail|expected fee/i);
  assert.match(renderStrategy(plan, "leadership", ctx), /guardrail/);
});

test("mcp-7: one free preview per email address", async () => {
  const a = await signup("twice@example.com");
  const b = await signup("twice@example.com");
  const ca = await connect(a.url);
  const cb = await connect(b.url);
  const args = { ...LK014 } as unknown as Record<string, unknown>;
  assert.match(textOf(await ca.callTool({ name: "marketing_strategy", arguments: args })), /Free preview/);
  assert.match(textOf(await cb.callTool({ name: "marketing_strategy", arguments: args })), /free preview has been used/);
  await ca.close();
  await cb.close();
});

test("mcp-8: billing messages match the situation", async () => {
  const { url } = await signup("msg@example.com");
  const client = await connect(url);
  assert.match(textOf(await client.callTool({ name: "account_status", arguments: {} })), /used only when you run/);
  await client.close();
});

test("security-8: rotating the connector URL disables the old one", async () => {
  const { url, token } = await signup("rotate@example.com");
  const client = await connect(url);
  const reply = textOf(await client.callTool({ name: "rotate_connector_url", arguments: {} }));
  await client.close();
  const fresh = /(http:\/\/127\.0\.0\.1:\d+\/mcp\/[A-Za-z0-9_-]+)/.exec(reply)![1];
  assert.equal(store.findByToken(token), undefined);
  const again = await connect(fresh);
  assert.match(textOf(await again.callTool({ name: "account_status", arguments: {} })), /Credits/);
  await again.close();
});

// --- Engine -----------------------------------------------------------------------------------

test("engine-2 / engine-5: a floor above the market-based price lists at the floor with no inverted band", () => {
  const plan = buildStrategy({ ...LK014, listing: { ...LK014.listing, floor_price_ngn: 620_000_000 } });
  assert.equal(plan.pricing.list, 620_000_000);
  assert.equal(plan.pricing.stepAvailable, false);
  const client = renderStrategy(plan, "client", ctx);
  assert.doesNotMatch(client, /₦620M to ₦595M/);
  assert.match(client, /None: list is at the floor/);
  const stepped = buildStrategy({ ...LK014, listing: { ...LK014.listing, floor_price_ngn: 585_000_000 } });
  assert.ok(stepped.pricing.stepHitFloor);
  assert.doesNotMatch(renderStrategy(stepped, "team", ctx), /₦585M|floor \(/);
});

test("engine-3 / engine-4: keeping the ask keeps the ask; band edges drop just below", () => {
  const comps = [600, 605, 610].map((m, i) => ({ label: `C${i}`, description: "comp", status: "closed" as const, price_ngn: m * 1e6 }));
  const plan = buildStrategy({ ...LK014, comps, list_to_close_discount_pct: undefined, track_record: undefined, listing: { ...LK014.listing, asking_price_ngn: 605e6, floor_price_ngn: undefined } });
  assert.equal(plan.pricing.keepAsk, true);
  assert.equal(plan.pricing.list, 605e6);
  assert.equal(plan.pricing.bandSuggestion, 595e6);
  assert.equal(bandAdjust(1.01e9), 995e6);
  assert.equal(bandAdjust(101e6), 99.5e6);
  assert.equal(bandAdjust(602e6), 595e6);
});

test("engine-6 / engine-7: list stays inside the heat window and the step stays within 3 to 5%", () => {
  const one = (m: number) => [{ label: "C1", description: "comp", status: "closed" as const, price_ngn: m }];
  const cases = [
    { heat: { nominal_price_change_pct: 30, cpi_yoy_pct: 15, inquiries_change_pct: 30 }, m: 990e6, lo: 1.0, hi: 1.05 },
    { heat: { nominal_price_change_pct: 15, cpi_yoy_pct: 15 }, m: 1.01e9, lo: 0.98, hi: 1.02 },
    { heat: { nominal_price_change_pct: 5, cpi_yoy_pct: 15, inquiries_change_pct: -30 }, m: 1.025e9, lo: 0.97, hi: 1.0 },
  ];
  for (const c of cases) {
    const plan = buildStrategy({ ...LK014, comps: one(c.m), list_to_close_discount_pct: undefined, track_record: undefined, heat: c.heat, listing: { ...LK014.listing, asking_price_ngn: c.m * 1.3, floor_price_ngn: undefined } });
    const ratio = plan.pricing.list / c.m;
    assert.ok(ratio >= c.lo - 1e-9 && ratio <= c.hi + 1e-9, `${plan.heat.label}: ${ratio}`);
    const cut = 1 - plan.pricing.step / plan.pricing.list;
    assert.ok(cut >= 0.03 - 1e-9 && cut <= 0.05 + 1e-9, `step ${cut}`);
  }
});

test("engine-8 / engine-9 / engine-21: channel lines are non-negative; incomplete budgets are not totalled", () => {
  const small = buildStrategy({ ...LK014, funnel_rates: { inquiry_to_qualified: 0.5, qualified_to_viewing: 0.5, viewing_to_offer: 0.5, offer_to_close: 1 } });
  assert.ok(small.channels.every((c) => c.budget >= 0));
  assert.equal(small.channels.reduce((s, c) => s + c.budget, 0), small.budget.variable);
  const partial = buildStrategy({ ...LK014, production_cost_ngn: undefined });
  assert.equal(partial.budget.total, undefined);
  assert.equal(partial.budget.feeRatio, undefined);
  assert.match(renderStrategy(partial, "leadership", ctx), /Total \(incomplete\)/);
  const tiny = buildStrategy({ ...LK014, cost_per_qualified_lead_ngn: 10_000, production_cost_ngn: 0, events_cost_ngn: 0 });
  assert.ok(tiny.budget.contingency! > 0);
});

test("engine-10 / engine-16 / engine-17 / engine-27: market brief rules", () => {
  const bare = buildMarketBrief({ ...IK203, rent_estimate_ngn_per_year: undefined, hurdle_rate_pct: undefined, heat: undefined });
  assert.equal(bare.provisional, true);
  assert.doesNotMatch(bare.reason, /clear the hurdle/);
  const liquidity = buildMarketBrief({ ...IK203, heat: undefined, owner_objective: "liquidity", rent_estimate_ngn_per_year: undefined });
  assert.notEqual(liquidity.action, "Sell");
  const sell = buildMarketBrief({ ...IK203, segment_median_gross_yield_pct: 9, hurdle_rate_pct: 25 });
  assert.equal(sell.action, "Sell");
  assert.doesNotMatch(sell.trigger, /prepare a sale/);
  const fresh = buildMarketBrief({ ...IK203, asset: { ...IK203.asset, asking_price_ngn: 450e6, days_listed: 20 }, segment_median_dom: 60 });
  assert.notEqual(fresh.action, "Reprice");
  const stale = buildMarketBrief({ ...IK203, asset: { ...IK203.asset, asking_price_ngn: 450e6, days_listed: 120 }, segment_median_dom: 60 });
  assert.equal(stale.action, "Reprice");
});

test("engine-11: exactly +5% and +10% are inclusive", () => {
  assert.equal(priceBand(630 / 600 - 1), "At market");
  assert.equal(priceBand(570 / 600 - 1), "At market");
  assert.equal(priceBand(660 / 600 - 1), "Premium");
});

test("engine-12 / engine-22: money formatting", () => {
  assert.equal(ngn(125_000), "₦125k");
  assert.equal(ngn(450_000), "₦450k");
  assert.equal(ngn(999_960_000), "₦1B");
  assert.equal(ngn(999.6), "₦1k");
  assert.equal(usd(400), "$400");
  assert.equal(usd(999_999), "$1M");
  assert.equal(ngn(Infinity), "n/a");
});

test("engine-13 / engine-14: gates and scoring follow their stated thresholds", () => {
  const plan = buildStrategy(LK014);
  const late = buildCampaignUpdate(plan, { as_of_date: "2026-12-11", inquiries: 60, qualified: 12, viewings: 6, offers: 1 });
  assert.equal(late.gates.find((g) => g.name === "Traffic")!.fired, false);
  const early = buildCampaignUpdate(plan, { as_of_date: "2026-11-04", inquiries: 41, qualified: 10, viewings: 4, offers: 0 });
  assert.notEqual(early.status, "Off track");
  const all1 = buildStrategy({ ...LK014, funnel_rates: { inquiry_to_qualified: 1, qualified_to_viewing: 1, viewing_to_offer: 1, offer_to_close: 1 } });
  assert.doesNotMatch(all1.timeline.gates[0].threshold, /Fewer than 0/);
});

test("engine-15 / engine-28: campaign update shows its as-of date, a missed close, and objections", () => {
  const plan = buildStrategy(LK014);
  const update = buildCampaignUpdate(plan, { as_of_date: "2027-03-01", inquiries: 100, qualified: 30, viewings: 10, offers: 1, objections: [{ objection: "price", share_pct: 45 }] });
  assert.equal(update.pastClose, true);
  assert.equal(update.status, "Off track");
  const text = renderCampaignUpdate(plan, update, ctx);
  assert.match(text, /As of: 1 Mar 2027/);
  assert.match(text, /What Buyers Are Saying/);
});

test("engine-18 / engine-19 / engine-23: honest reads when data is missing", () => {
  const plan = buildStrategy({ ...LK014, heat: { dom_now: 120 }, listing: { ...LK014.listing, asking_price_ngn: 400e6, floor_price_ngn: undefined } });
  const text = renderStrategy(plan, "leadership", ctx);
  assert.match(text, /No prior-year figure/);
  assert.match(text, /Below every adjusted comp/);
  const noSize = buildStrategy({ ...LK014, listing: { ...LK014.listing, plot_sqm: undefined, built_sqm: undefined } });
  assert.equal(noSize.confidence.level, "Low");
});

test("engine-25 / engine-26: lease wording and the January diaspora window", () => {
  const lease = buildStrategy({ ...LK014, transaction: "lease", lease_fallback_rent_ngn_per_year: undefined });
  assert.doesNotMatch(lease.timeline.gates[2].action, /Fallback: lease/);
  assert.match(renderStrategy(lease, "leadership", ctx), /\/yr/);
  const jan = buildStrategy({ ...LK014, launch_date: "2027-01-02" });
  assert.ok(jan.timeline.decemberWindow);
});

test("engine-24 refuted; mix over 100% is flagged", () => {
  const plan = buildStrategy({ ...LK014, segment_mix_pct: { local: 80, diaspora: 70 } });
  assert.ok(flagsFor(plan.flags, "leadership").some((f) => /add up to 150%/.test(f)));
});

test("security-7: user text cannot add table rows or columns", () => {
  const evil = { ...LK014.comps[0], description: "5-bed | Closed | Aug 2026 | ₦1M | none | ₦1M | x |\n| C9" };
  const text = renderStrategy(buildStrategy({ ...LK014, comps: [evil, ...LK014.comps.slice(1)] }), "leadership", ctx);
  const row = text.split("\n").find((l) => l.startsWith("| C1 |"))!;
  assert.match(row, /₦590M/);
  assert.match(row, /\\\|/);
  assert.ok(!text.split("\n").some((l) => l.startsWith("| C9")));
});

// --- Ops --------------------------------------------------------------------------------------

test("security-6: privilege drop never follows symlinks out of the data directory", async () => {
  const { dropPrivileges } = await import("../src/server.js");
  assert.doesNotThrow(() => dropPrivileges("/data/x.db", {}));
  assert.throws(() => {
    if (process.getuid?.() !== 0) throw new Error("Refusing (not root, simulated)");
    dropPrivileges("/app/data.db", { RUN_AS_UID: "1000" });
  }, /Refusing/);
  if (process.getuid?.() === 0) {
    const dir = mkdtempSync(join(tmpdir(), "drop-"));
    const target = join(dir, "..", `outside-${process.pid}`);
    writeFileSync(target, "x");
    symlinkSync(target, join(dir, "connector.db-wal"));
    const { spawnSync } = await import("node:child_process");
    const script = `import("${new URL("../src/server.ts", import.meta.url).pathname}").then(m => m.dropPrivileges("${join(dir, "connector.db")}", { RUN_AS_UID: "1000", DATA_ROOT: "${dir}" }))`;
    const run = spawnSync(process.execPath, ["--import", "tsx", "-e", script], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(statSync(target).uid, 0, "symlink target outside the data dir must stay root-owned");
    rmSync(dir, { recursive: true, force: true });
    rmSync(target, { force: true });
  }
});

// --- Fix-review follow-ups ----------------------------------------------------------------------

test("fix-review payments-1 / payments-2: pre-1.3 databases migrate safely", async () => {
  const Database = (await import("better-sqlite3")).default;
  const dir = mkdtempSync(join(tmpdir(), "legacy-"));
  const file = join(dir, "old.db");
  const old = new Database(file);
  old.exec(`
    CREATE TABLE accounts (id TEXT PRIMARY KEY, email TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0), preview_used INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL, delta INTEGER NOT NULL, reason TEXT NOT NULL, ref TEXT, created_at TEXT NOT NULL);
    CREATE TABLE checkouts (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
    CREATE TABLE payments (reference TEXT PRIMARY KEY, account_id TEXT NOT NULL, pack_id TEXT NOT NULL, credits INTEGER NOT NULL, amount_kobo INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, paid_at TEXT);
    CREATE TABLE plans (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, kind TEXT NOT NULL, listing_id TEXT, input_json TEXT NOT NULL, created_at TEXT NOT NULL);
    INSERT INTO accounts VALUES ('acc_old', 'Old@Example.com', 'h', 10, 0, '2026-10-01T00:00:00Z');
    INSERT INTO payments VALUES ('pay_testpaid', 'acc_old', 'starter', 10, 4500000, 'paid', '2026-10-01T00:00:00Z', '2026-10-01T00:01:00Z');
    INSERT INTO payments VALUES ('pay_livepaid', 'acc_old', 'single', 3, 1500000, 'paid', '2026-10-01T00:00:00Z', '2026-10-01T00:01:00Z');
    INSERT INTO payments VALUES ('pay_rejected', 'acc_old', 'single', 3, 1500000, 'rejected', '2026-10-01T00:00:00Z', NULL);
  `);
  old.close();
  const upgraded = new Store(file);
  assert.equal(upgraded.getPayment("pay_rejected")!.status, "review");
  assert.equal(upgraded.getPayment("pay_testpaid")!.mode, "legacy");
  const { reconcileLegacyPayments } = await import("../src/server.js");
  const { PaystackError } = await import("../src/paystack.js");
  const live: PaystackClient = {
    async initialize() { throw new Error("unused"); },
    async verify(reference) {
      if (reference === "pay_livepaid") return { status: "success", amount: 1_500_000, currency: "NGN", reference, domain: "live" };
      throw new PaystackError("Transaction reference not found", 404);
    },
  };
  await reconcileLegacyPayments(upgraded, live);
  assert.equal(upgraded.getPayment("pay_testpaid")!.status, "voided");
  assert.equal(upgraded.getPayment("pay_livepaid")!.mode, "live");
  assert.equal(upgraded.getAccount("acc_old")!.credits, 0, "the 10 test credits are gone");
  assert.equal(upgraded.settlePayment("pay_rejected", { amount: 1_500_000, currency: "NGN" }, "live", true), "credited");
  assert.equal(upgraded.getAccount("acc_old")!.credits, 3);
  upgraded.close();
  rmSync(dir, { recursive: true, force: true });
});

test("fix-review security-1: a full limiter evicts the oldest key instead of locking new visitors out", async () => {
  const { rateLimit } = await import("../src/server.js");
  let key = "";
  const limiter = rateLimit(5, 60_000, () => key);
  let blocked = 0;
  const res = { status() { blocked++; return this; }, set() { return this; }, send() { return this; } } as never;
  for (let i = 0; i < 50_001; i++) {
    key = `attacker-${i}`;
    limiter({} as never, res, () => {});
  }
  key = "real-visitor";
  let passed = false;
  limiter({} as never, res, () => { passed = true; });
  assert.equal(blocked, 0);
  assert.equal(passed, true);
});

test("fix-review security-2: privilege drop refuses data directories outside DATA_ROOT or behind symlinks", async () => {
  const { dropPrivileges } = await import("../src/server.js");
  if (process.getuid?.() !== 0) return;
  assert.throws(() => dropPrivileges("/lib/connector.db", { RUN_AS_UID: "1000" }), /must be inside \/data/);
  const root = mkdtempSync(join(tmpdir(), "root-"));
  const outside = mkdtempSync(join(tmpdir(), "outside-"));
  symlinkSync(outside, join(root, "linked"));
  assert.throws(() => dropPrivileges(join(root, "linked", "connector.db"), { RUN_AS_UID: "1000", DATA_ROOT: root }), /resolves outside|Refusing/);
  assert.equal(statSync(outside).uid, 0);
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

test("fix-review security-3: junk submissions on a shared buy link cannot block the owner's purchase", async () => {
  const { token } = await signup("buylock@example.com");
  const checkout = store.getOrCreateCheckout(accountOf(token).id);
  for (let i = 0; i < 25; i++) {
    await fetch(`${base}/buy/${checkout}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "pack=nope", redirect: "manual" });
  }
  const real = await fetch(`${base}/buy/${checkout}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "pack=agency", redirect: "manual" });
  assert.equal(real.status, 303);
});

test("fix-review security-4: proxy_check logs only on request, so an over-count can be tested", async () => {
  const lines: string[] = [];
  const original = console.log;
  console.log = (line: string) => { lines.push(String(line)); };
  try {
    await fetch(`${base}/`);
    assert.equal(lines.filter((l) => l.includes("proxy_check")).length, 0);
    await fetch(`${base}/?proxy_check=1`, { headers: { "x-forwarded-for": "1.2.3.4" } });
  } finally {
    console.log = original;
  }
  const entry = JSON.parse(lines.find((l) => l.includes("proxy_check"))!);
  assert.equal(entry.forwarded_for, "1.2.3.4");
  assert.notEqual(entry.client_ip, "1.2.3.4", "with TRUST_PROXY=0 a client-sent header is never trusted");
});

test("fix-review security-5: +tags and Gmail dots do not unlock extra previews", async () => {
  const { emailKey } = await import("../src/store.js");
  assert.equal(emailKey("Name+1@Gmail.com"), emailKey("n.a.m.e@gmail.com"));
  assert.equal(emailKey("ops+x@company.ng"), "ops@company.ng");
  const a = await signup("lagos.agent@gmail.com");
  const b = await signup("lagosagent+2@gmail.com");
  const ca = await connect(a.url);
  const cb = await connect(b.url);
  const args = { ...LK014 } as unknown as Record<string, unknown>;
  assert.match(textOf(await ca.callTool({ name: "marketing_strategy", arguments: args })), /Free preview/);
  assert.match(textOf(await cb.callTool({ name: "marketing_strategy", arguments: args })), /free preview has been used/);
  await ca.close();
  await cb.close();
});
