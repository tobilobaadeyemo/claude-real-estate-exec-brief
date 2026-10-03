import express, { type NextFunction, type Request, type Response } from "express";
import { pathToFileURL } from "node:url";
import { chownSync, lstatSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig, type Config } from "./config.js";
import { Store, type Account } from "./store.js";
import { createMcpServer } from "./mcp.js";
import { createPaystackClient, verifyWebhookSignature, type PaystackClient } from "./paystack.js";
import { buyPage, connectorCreatedPage, landingPage, messagePage, privacyPage } from "./web.js";

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const MAX_LIMITER_KEYS = 50_000;

/**
 * Fixed-window limiter keyed by caller; enough for a single-instance service.
 * Expired keys are swept on a timer (never on the request path), and the key table is capped,
 * so attacker-chosen keys cannot make each request slower.
 */
export function rateLimit(limit: number, windowMs: number, key: (req: Request) => string) {
  const hits = new Map<string, { count: number; reset: number }>();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs);
  sweep.unref();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const k = key(req);
    const entry = hits.get(k);
    if (!entry || entry.reset < now) {
      if (!entry && hits.size >= MAX_LIMITER_KEYS) {
        res.status(429).set("Retry-After", "60").send("Too many requests");
        return;
      }
      hits.set(k, { count: 1, reset: now + windowMs });
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

const ipOf = (req: Request) => req.ip ?? "unknown";

/** Paystack event payloads name the transaction reference in different places. */
function eventReference(data: Record<string, unknown> | undefined): string | undefined {
  if (!data) return undefined;
  const tx = data.transaction as Record<string, unknown> | undefined;
  const candidates = [data.transaction_reference, tx?.reference, data.reference];
  return candidates.find((c): c is string => typeof c === "string" && c.length > 0);
}

export interface AppDeps {
  config: Config;
  store: Store;
  paystack: PaystackClient;
}

export function createApp({ config, store, paystack }: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  if (config.trustProxy > 0) app.set("trust proxy", config.trustProxy);
  app.use(securityHeaders);

  // One log line on the first real request, so the operator can check TRUST_PROXY against the platform.
  let proxyChecked = config.trustProxy === 0;
  app.use((req, _res, next) => {
    if (!proxyChecked && req.path !== "/healthz") {
      proxyChecked = true;
      console.log(JSON.stringify({ event: "proxy_check", trust_proxy_hops: config.trustProxy, client_ip: req.ip, forwarded_for: req.get("x-forwarded-for") ?? null }));
    }
    next();
  });

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  // Paystack webhook needs the raw body for signature verification, whatever the content type.
  app.post("/paystack/webhook", rateLimit(600, 60_000, ipOf), express.raw({ type: () => true, limit: "200kb" }), async (req, res) => {
    if (!verifyWebhookSignature(req.body, req.get("x-paystack-signature"), config.paystackSecretKey)) {
      res.status(401).end();
      return;
    }
    let event: { event?: string; data?: Record<string, unknown> };
    try {
      event = JSON.parse((req.body as Buffer).toString("utf8"));
    } catch {
      res.status(400).end();
      return;
    }
    try {
      const reference = eventReference(event.data);
      if (event.event === "charge.success" && reference) {
        const tx = await paystack.verify(reference);
        if (tx.status === "success") store.settlePayment(tx.reference, tx, config.keyMode);
      } else if ((event.event === "refund.processed" || event.event === "charge.dispute.create") && reference) {
        store.reversePayment(reference, event.event);
      }
      res.status(200).end();
    } catch (err) {
      // 500 makes Paystack retry later; settlement is idempotent.
      console.error(JSON.stringify({ event: "webhook_error", message: (err as Error).message }));
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

  app.post("/signup", rateLimit(30, 3_600_000, ipOf), (req, res) => {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    if (!EMAIL.test(email)) {
      res.status(400).type("html").send(messagePage("Check your email", "Enter a valid email address."));
      return;
    }
    const { token } = store.createAccount(email);
    res.set("Cache-Control", "no-store").type("html").send(connectorCreatedPage(`${config.baseUrl}/mcp/${token}`, config.supportEmail));
  });

  app.get("/buy/:checkoutId", rateLimit(120, 60_000, ipOf), (req, res) => {
    const checkout = store.getCheckout(String(req.params.checkoutId));
    if (!checkout) {
      res.status(404).type("html").send(messagePage("Link expired", "Ask Claude for a new buy link (buy_credits)."));
      return;
    }
    res.set("Cache-Control", "no-store").type("html").send(buyPage(checkout.id, config));
  });

  // Purchases are limited per account (the checkout identifies it), not per IP, so buyers behind
  // a shared proxy or carrier NAT never block each other.
  const purchaseLimiter = rateLimit(20, 3_600_000, (req) => String(res_locals(req).accountId ?? ipOf(req)));
  app.post(
    "/buy/:checkoutId",
    rateLimit(120, 60_000, ipOf),
    (req, res, next) => {
      const checkout = store.getCheckout(String(req.params.checkoutId));
      const account = checkout && store.getAccount(checkout.account_id);
      if (!checkout || !account) {
        res.status(400).type("html").send(messagePage("Could not start payment", "The link expired. Ask Claude for a new buy link."));
        return;
      }
      res_locals(req).accountId = account.id;
      res_locals(req).account = account;
      next();
    },
    purchaseLimiter,
    async (req, res) => {
      const account = res_locals(req).account as Account;
      const pack = config.packs.find((p) => p.id === String(req.body?.pack ?? ""));
      if (!pack) {
        res.status(400).type("html").send(messagePage("Could not start payment", "Choose one of the listed packs."));
        return;
      }
      try {
        const payment = store.createPayment(account.id, pack, config.keyMode);
        const { authorizationUrl } = await paystack.initialize({
          email: account.email,
          amountKobo: pack.price_kobo,
          reference: payment.reference,
          callbackUrl: `${config.baseUrl}/paid`,
          metadata: { pack_id: pack.id, credits: pack.credits },
        });
        res.redirect(303, authorizationUrl);
      } catch (err) {
        console.error(JSON.stringify({ event: "payment_start_failed", message: (err as Error).message }));
        res.status(502).type("html").send(messagePage("Payment unavailable", "The payment could not be started. Try again in a few minutes."));
      }
    },
  );

  // Paystack redirects here after checkout; verify server-side so credits land even if the webhook is late.
  app.get("/paid", rateLimit(60, 60_000, ipOf), async (req, res) => {
    const reference = String(req.query.reference ?? req.query.trxref ?? "");
    const payment = reference ? store.getPayment(reference) : undefined;
    const support = config.supportEmail ? ` Contact ${config.supportEmail} with reference ${reference}.` : ` Keep your reference: ${reference}.`;
    if (!payment) {
      res.status(404).type("html").send(messagePage("Payment not found", "If you were charged, credits arrive automatically within a few minutes."));
      return;
    }
    try {
      if ((payment.status === "pending" || payment.status === "review") && store.claimVerifySlot(reference)) {
        const tx = await paystack.verify(reference);
        if (tx.status === "success") store.settlePayment(tx.reference, tx, config.keyMode);
      }
      const settled = store.getPayment(reference)!;
      const message =
        settled.status === "paid"
          ? `Payment confirmed: ${settled.credits} credits added. Return to Claude and ask it to run the strategy again.`
          : settled.status === "review"
            ? `Your payment was received but needs a manual check before credits are added.${support}`
            : settled.status === "reversed" || settled.status === "voided"
              ? `This payment was refunded or cancelled, so no credits are attached to it.${support}`
              : "Payment not confirmed yet. If you were charged, credits arrive automatically within a few minutes.";
      res.set("Cache-Control", "no-store").type("html").send(messagePage(settled.status === "paid" ? "Credits added" : "Payment status", message));
    } catch (err) {
      console.error(JSON.stringify({ event: "paid_verify_failed", message: (err as Error).message }));
      res.status(502).type("html").send(messagePage("Payment pending", "We could not confirm the payment yet. Credits arrive automatically once Paystack confirms."));
    }
  });

  // MCP over Streamable HTTP, stateless. The account token comes from the URL path
  // (Claude.ai custom connectors) or an Authorization: Bearer header (Claude Code, API clients).
  const tokenOf = (req: Request) => String(req.params.token ?? req.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const mcpError = (res: Response, status: number, code: number, message: string) =>
    res.status(status).json({ jsonrpc: "2.0", error: { code, message }, id: null });
  // Claude.ai calls connectors from a small set of Anthropic server IPs shared by every user, so the
  // per-IP limit is only a flood backstop; real limits are per account. Unknown tokens are refused
  // with a single indexed lookup before any per-token state or body parsing.
  app.post(
    ["/mcp/:token", "/mcp"],
    rateLimit(6000, 60_000, ipOf),
    (req, res, next) => {
      const account = store.findByToken(tokenOf(req));
      if (!account) {
        mcpError(res, 401, -32001, "Unknown connector URL");
        return;
      }
      res_locals(req).account = account;
      next();
    },
    rateLimit(120, 60_000, (req) => (res_locals(req).account as Account).id),
    express.json({ limit: "1mb" }),
    async (req, res) => {
      if (Array.isArray(req.body)) {
        mcpError(res, 400, -32600, "Batched JSON-RPC requests are not supported");
        return;
      }
      const server = createMcpServer(res_locals(req).account as Account, store, config);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (err) {
        console.error(JSON.stringify({ event: "mcp_error", message: (err as Error).message }));
        if (!res.headersSent) mcpError(res, 500, -32603, "Internal error");
      }
    },
  );

  app.all(["/mcp/:token", "/mcp"], (_req, res) => {
    mcpError(res, 405, -32000, "Method not allowed");
  });

  // Malformed or oversized JSON gets a JSON-RPC error, without a stack trace in the logs.
  app.use((err: Error & { type?: string; status?: number }, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    if (err.type === "entity.parse.failed") return void (req.path.startsWith("/mcp") ? mcpError(res, 400, -32700, "Parse error") : res.status(400).end());
    if (err.type === "entity.too.large") return void (req.path.startsWith("/mcp") ? mcpError(res, 413, -32600, "Request too large") : res.status(413).end());
    console.error(JSON.stringify({ event: "http_error", message: err.message }));
    res.status(err.status ?? 500).end();
  });

  return app;
}

/** Per-request scratch space shared by middleware. */
function res_locals(req: Request): Record<string, unknown> {
  return ((req as Request & { _locals?: Record<string, unknown> })._locals ??= {});
}

const DB_FILES = ["", "-wal", "-shm", "-journal"];

/**
 * Container disks usually mount owned by root. When started as root with RUN_AS_UID set,
 * hand the data directory and the database files to that user, then drop privileges
 * (including root's supplementary groups) before touching the database.
 */
export function dropPrivileges(databasePath: string, env: NodeJS.ProcessEnv = process.env): void {
  if (process.getuid?.() !== 0 || !env.RUN_AS_UID || databasePath === ":memory:") return;
  const uid = Number(env.RUN_AS_UID);
  const gid = Number(env.RUN_AS_GID ?? env.RUN_AS_UID);
  if (!Number.isInteger(uid) || !Number.isInteger(gid) || uid === 0) throw new Error("RUN_AS_UID/RUN_AS_GID must name a non-root user");
  const dbPath = resolve(databasePath);
  const dir = dirname(dbPath);
  if (dir === "/" || dir === "/app" || dir.startsWith("/app/") || dir === "/etc" || dir.startsWith("/usr")) {
    throw new Error(`Refusing to take ownership of ${dir}; put DATABASE_PATH on a data volume such as /data`);
  }
  mkdirSync(dir, { recursive: true });
  chownSync(dir, uid, gid);
  for (const suffix of DB_FILES) {
    const file = join(dir, `${dbPath.slice(dir.length + 1)}${suffix}`);
    try {
      // Never follow symlinks while still root.
      if (lstatSync(file).isFile()) chownSync(file, uid, gid);
    } catch {
      // File does not exist yet.
    }
  }
  process.setgroups!([gid]);
  process.setgid!(gid);
  process.setuid!(uid);
  if (process.getuid!() !== uid || process.getgid!() !== gid || process.getgroups!().some((g) => g !== gid)) {
    throw new Error("Privilege drop did not take effect");
  }
}

export function main(): void {
  const config = loadConfig();
  dropPrivileges(config.databasePath);
  if (!config.paystackSecretKey) console.warn("PAYSTACK_SECRET_KEY is not set: purchases will fail until it is configured.");
  const store = new Store(config.databasePath);
  if (config.keyMode === "live") {
    const voided = store.voidTestCredits();
    if (voided) console.log(JSON.stringify({ event: "test_credits_voided", payments: voided }));
  }
  store.purgeExpired();
  const purge = setInterval(() => store.purgeExpired(), 3_600_000);
  purge.unref();

  const paystack = createPaystackClient(config.paystackSecretKey, config.paystackBaseUrl);
  const app = createApp({ config, store, paystack });
  const server = app.listen(config.port, (err?: Error) => {
    if (err) {
      console.error(JSON.stringify({ event: "listen_failed", message: err.message }));
      process.exit(1);
    }
    console.log(`Lagos Brief connector listening on ${config.baseUrl} (port ${config.port}, Paystack ${config.keyMode} mode)`);
  });
  // Longer than the platform proxy's idle timeout, so reused connections are not cut mid-request.
  server.keepAliveTimeout = 120_000;
  server.headersTimeout = 121_000;

  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      store.close();
      process.exit(0);
    };
    server.close(finish);
    server.closeIdleConnections();
    setTimeout(() => {
      server.closeAllConnections();
      finish();
    }, 10_000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
