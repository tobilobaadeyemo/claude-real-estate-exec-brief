import express, { type NextFunction, type Request, type Response } from "express";
import { pathToFileURL } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig, type Config } from "./config.js";
import { Store } from "./store.js";
import { createMcpServer } from "./mcp.js";
import { createPaystackClient, verifyWebhookSignature, type PaystackClient } from "./paystack.js";
import { buyPage, connectorCreatedPage, landingPage, messagePage, privacyPage } from "./web.js";

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

/** Fixed-window limiter keyed by caller; enough for a single-instance service. */
function rateLimit(limit: number, windowMs: number, key: (req: Request) => string) {
  const hits = new Map<string, { count: number; reset: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const k = key(req);
    const entry = hits.get(k);
    if (!entry || entry.reset < now) {
      hits.set(k, { count: 1, reset: now + windowMs });
      if (hits.size > 10_000) for (const [hk, v] of hits) if (v.reset < now) hits.delete(hk);
      return next();
    }
    if (++entry.count > limit) {
      res.status(429).set("Retry-After", String(Math.ceil((entry.reset - now) / 1000))).send("Too many requests");
      return;
    }
    next();
  };
}

function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://checkout.paystack.com; frame-ancestors 'none'; base-uri 'none'",
  });
  next();
}

export interface AppDeps {
  config: Config;
  store: Store;
  paystack: PaystackClient;
}

export function createApp({ config, store, paystack }: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", 1);
  app.use(securityHeaders);

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  // Paystack webhook needs the raw body for signature verification.
  app.post("/paystack/webhook", express.raw({ type: "application/json", limit: "200kb" }), async (req, res) => {
    const raw = req.body as Buffer;
    if (!verifyWebhookSignature(raw, req.get("x-paystack-signature"), config.paystackSecretKey)) {
      res.status(401).end();
      return;
    }
    try {
      const event = JSON.parse(raw.toString("utf8")) as { event?: string; data?: { reference?: string } };
      if (event.event === "charge.success" && event.data?.reference) {
        const tx = await paystack.verify(event.data.reference);
        if (tx.status === "success") store.settlePayment(tx.reference, tx.amount, tx.currency);
      }
      res.status(200).end();
    } catch (err) {
      console.error("webhook error", (err as Error).message);
      res.status(500).end();
    }
  });

  app.use(express.urlencoded({ extended: false, limit: "10kb" }));

  app.get("/", (_req, res) => {
    res.type("html").send(landingPage(config));
  });

  app.get("/privacy", (_req, res) => {
    res.type("html").send(privacyPage(config));
  });

  app.post(
    "/signup",
    rateLimit(10, 3_600_000, (req) => req.ip ?? "unknown"),
    (req, res) => {
      const email = String(req.body?.email ?? "").trim().toLowerCase();
      if (!EMAIL.test(email)) {
        res.status(400).type("html").send(messagePage("Check your email", "Enter a valid email address."));
        return;
      }
      const { token } = store.createAccount(email);
      res.set("Cache-Control", "no-store").type("html").send(connectorCreatedPage(`${config.baseUrl}/mcp/${token}`));
    },
  );

  app.get("/buy/:checkoutId", (req, res) => {
    const checkout = store.getCheckout(String(req.params.checkoutId));
    if (!checkout) {
      res.status(404).type("html").send(messagePage("Link expired", "Ask Claude for a new buy link (buy_credits)."));
      return;
    }
    res.set("Cache-Control", "no-store").type("html").send(buyPage(checkout.id, config));
  });

  app.post(
    "/buy/:checkoutId",
    rateLimit(20, 3_600_000, (req) => req.ip ?? "unknown"),
    async (req, res) => {
      const checkout = store.getCheckout(String(req.params.checkoutId));
      const pack = config.packs.find((p) => p.id === String(req.body?.pack ?? ""));
      const account = checkout && store.getAccount(checkout.account_id);
      if (!checkout || !pack || !account) {
        res.status(400).type("html").send(messagePage("Could not start payment", "The link expired or the pack is invalid. Ask Claude for a new buy link."));
        return;
      }
      const payment = store.createPayment(account.id, pack);
      try {
        const { authorizationUrl } = await paystack.initialize({
          email: account.email,
          amountKobo: pack.price_kobo,
          reference: payment.reference,
          callbackUrl: `${config.baseUrl}/paid`,
          metadata: { pack_id: pack.id, credits: pack.credits },
        });
        res.redirect(303, authorizationUrl);
      } catch (err) {
        console.error("paystack initialize failed", (err as Error).message);
        res.status(502).type("html").send(messagePage("Payment unavailable", "Paystack could not start the payment. Try again in a few minutes."));
      }
    },
  );

  // Paystack redirects here after checkout; verify server-side so credits land even if the webhook is late.
  app.get("/paid", async (req, res) => {
    const reference = String(req.query.reference ?? req.query.trxref ?? "");
    const payment = reference && store.getPayment(reference);
    if (!payment) {
      res.status(404).type("html").send(messagePage("Payment not found", "If you were charged, credits arrive automatically within a few minutes."));
      return;
    }
    try {
      if (payment.status === "pending") {
        const tx = await paystack.verify(reference);
        if (tx.status === "success") store.settlePayment(tx.reference, tx.amount, tx.currency);
      }
      const settled = store.getPayment(reference)!;
      const credits = store.getAccount(settled.account_id)?.credits ?? 0;
      const message =
        settled.status === "paid"
          ? `Payment confirmed. Your balance is ${credits} credits. Return to Claude and ask it to run the strategy again.`
          : settled.status === "rejected"
            ? "This payment did not match the selected pack and was not credited. Contact support with your reference."
            : "Payment not confirmed yet. If you were charged, credits arrive automatically within a few minutes.";
      res.set("Cache-Control", "no-store").type("html").send(messagePage(settled.status === "paid" ? "Credits added" : "Payment pending", message));
    } catch (err) {
      console.error("paystack verify failed", (err as Error).message);
      res.status(502).type("html").send(messagePage("Payment pending", "We could not confirm the payment yet. Credits arrive automatically once Paystack confirms."));
    }
  });

  // MCP over Streamable HTTP, stateless. The account token comes from the URL path
  // (Claude.ai custom connectors) or an Authorization: Bearer header (Claude Code, API clients).
  const tokenOf = (req: Request) => String(req.params.token ?? req.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const mcpLimiter = rateLimit(120, 60_000, (req) => tokenOf(req).slice(0, 16));
  app.post(["/mcp/:token", "/mcp"], mcpLimiter, express.json({ limit: "1mb" }), async (req, res) => {
    const account = store.findByToken(tokenOf(req));
    if (!account) {
      res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unknown connector URL" }, id: null });
      return;
    }
    const server = createMcpServer(account, store, config);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("mcp error", (err as Error).message);
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
    }
  });

  app.all(["/mcp/:token", "/mcp"], (_req, res) => {
    res.status(405).set("Allow", "POST").json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
  });

  return app;
}

export function main(): void {
  const config = loadConfig();
  if (!config.paystackSecretKey) console.warn("PAYSTACK_SECRET_KEY is not set: purchases will fail until it is configured.");
  const store = new Store(config.databasePath);
  const paystack = createPaystackClient(config.paystackSecretKey, config.paystackBaseUrl);
  const app = createApp({ config, store, paystack });
  const server = app.listen(config.port, () => console.log(`Lagos Brief connector listening on ${config.baseUrl} (port ${config.port})`));
  const shutdown = () => server.close(() => {
    store.close();
    process.exit(0);
  });
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
