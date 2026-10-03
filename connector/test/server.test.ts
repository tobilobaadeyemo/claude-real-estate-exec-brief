import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "../src/server.js";
import { Store } from "../src/store.js";
import { DEFAULT_PACKS, type Config } from "../src/config.js";
import type { PaystackClient, VerifiedTransaction } from "../src/paystack.js";
import { LK014 } from "./fixtures.js";

const SECRET = "sk_test_fake";
let server: Server;
let base: string;
let store: Store;
const verified = new Map<string, VerifiedTransaction>();
const initialized: string[] = [];

const paystack: PaystackClient = {
  async initialize(p) {
    initialized.push(p.reference);
    verified.set(p.reference, { status: "success", amount: p.amountKobo, currency: "NGN", reference: p.reference });
    return { authorizationUrl: `https://checkout.paystack.com/fake/${p.reference}` };
  },
  async verify(reference) {
    const tx = verified.get(reference);
    if (!tx) throw new Error("unknown reference");
    return tx;
  },
};

before(async () => {
  store = new Store(":memory:");
  const config: Config = { port: 0, baseUrl: "", databasePath: ":memory:", paystackSecretKey: SECRET, paystackBaseUrl: "", packs: DEFAULT_PACKS, trustProxy: false };
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

async function signup(): Promise<string> {
  const res = await fetch(`${base}/signup`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "email=agent%40example.com" });
  assert.equal(res.status, 200);
  const html = await res.text();
  const match = /(http:\/\/127\.0\.0\.1:\d+\/mcp\/[A-Za-z0-9_-]+)/.exec(html);
  assert.ok(match, "connector URL in page");
  return match[1];
}

async function connect(url: string): Promise<Client> {
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  return client;
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  return (result.content as { type: string; text: string }[]).map((c) => c.text).join("\n");
}

async function webhook(body: object, secret = SECRET): Promise<number> {
  const raw = JSON.stringify(body);
  const signature = createHmac("sha512", secret).update(raw).digest("hex");
  const res = await fetch(`${base}/paystack/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-paystack-signature": signature }, body: raw });
  return res.status;
}

test("free preview once, locked after, paid unlock end to end", async () => {
  const url = await signup();
  const client = await connect(url);
  const tools = (await client.listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(tools, ["account_status", "audience_version", "buy_credits", "campaign_update", "delete_my_data", "market_brief", "marketing_strategy"]);

  const args = { ...LK014, audience: "leadership" } as unknown as Record<string, unknown>;
  const preview = textOf(await client.callTool({ name: "marketing_strategy", arguments: args }));
  assert.match(preview, /Free preview/);
  assert.match(preview, /Overpriced/);
  assert.doesNotMatch(preview, /₦595M/);

  const lockedText = textOf(await client.callTool({ name: "marketing_strategy", arguments: args }));
  assert.match(lockedText, /free preview has been used/);
  assert.doesNotMatch(lockedText, /Overpriced|₦586\.5M/);
  const buyUrl = /(http:\/\/127\.0\.0\.1:\d+\/buy\/[A-Za-z0-9_-]+)/.exec(lockedText)![1];

  assert.equal((await fetch(buyUrl)).status, 200);
  const pay = await fetch(buyUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "pack=starter", redirect: "manual" });
  assert.equal(pay.status, 303);
  assert.match(pay.headers.get("location")!, /^https:\/\/checkout\.paystack\.com\/fake\//);
  const reference = initialized.at(-1)!;

  assert.equal(await webhook({ event: "charge.success", data: { reference } }), 200);
  assert.equal(await webhook({ event: "charge.success", data: { reference } }), 200);
  const status = textOf(await client.callTool({ name: "account_status", arguments: {} }));
  assert.match(status, /Credits: 10\b/);

  const full = textOf(await client.callTool({ name: "marketing_strategy", arguments: args }));
  assert.match(full, /List at ₦595M, not ₦650M/);
  assert.match(full, /Balance: 7/);
  const planId = /plan_id (pln_[A-Za-z0-9_-]+)/.exec(full)![1];

  const client2 = textOf(await client.callTool({ name: "audience_version", arguments: { plan_id: planId, audience: "client" } }));
  assert.doesNotMatch(client2, /expected fee/i);
  assert.match(textOf(await client.callTool({ name: "account_status", arguments: {} })), /Credits: 7\b/);

  const update = textOf(await client.callTool({ name: "campaign_update", arguments: { plan_id: planId, as_of_date: "2026-11-11", inquiries: 50, qualified: 12, viewings: 6, offers: 0, price_objection_share_pct: 50 } }));
  assert.match(update, /Off track/);
  assert.match(update, /Balance: 6/);

  const paid = await fetch(`${base}/paid?reference=${reference}`);
  assert.match(await paid.text(), /6 credits/);
  await client.close();
});

test("webhook rejects bad signatures and mismatched amounts", async () => {
  assert.equal(await webhook({ event: "charge.success", data: { reference: "x" } }, "wrong"), 401);
  const { account } = store.createAccount("buyer@example.com");
  const payment = store.createPayment(account.id, DEFAULT_PACKS[0]);
  verified.set(payment.reference, { status: "success", amount: 100, currency: "NGN", reference: payment.reference });
  assert.equal(await webhook({ event: "charge.success", data: { reference: payment.reference } }), 200);
  assert.equal(store.getPayment(payment.reference)!.status, "rejected");
  assert.equal(store.getAccount(account.id)!.credits, 0);
});

test("unknown connector URL is refused", async () => {
  const res = await fetch(`${base}/mcp/not-a-real-token`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  assert.equal(res.status, 401);
});

test("bearer header works for header-capable clients", async () => {
  const url = await signup();
  const token = url.split("/mcp/")[1];
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  assert.match(textOf(await client.callTool({ name: "account_status", arguments: {} })), /Credits: 0/);
  await client.close();
});

test("credits never go negative and preview is single use", () => {
  const { account } = store.createAccount("solo@example.com");
  assert.equal(store.charge(account.id, 3, "test"), false);
  assert.equal(store.claimPreview(account.id), true);
  assert.equal(store.claimPreview(account.id), false);
  store.grant(account.id, 2, "test");
  assert.equal(store.charge(account.id, 3, "test"), false);
  assert.equal(store.getAccount(account.id)!.credits, 2);
});
