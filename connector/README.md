# Lagos Brief Connector (paid)

A remote MCP server that users add to Claude as a custom connector. It computes the same briefs as the free skill, with every number calculated in code, and charges per call in naira through Paystack.

- **Free:** one preview per account (the market diagnosis: price position, heat, evidence). The prescription stays locked.
- **Paid:** full marketing strategy (all three audience versions), market brief, weekly campaign updates.
- **Zero model cost:** the server never calls an LLM. The user's own Claude calls the tools and writes around the computed brief, so each paid call is close to pure margin.

## How users pay per call

| Tool | Cost | Returns |
|---|---:|---|
| `marketing_strategy` | 3 credits | Full strategy + `plan_id`. Re-running the same listing inputs within 30 days is free. With too few credits, a new account's first call returns the free preview |
| `audience_version` | free | Leadership, client, or team version of a paid plan |
| `market_brief` | 2 credits | Hold / sell / lease / reprice decision. First call on a new account: free preview |
| `campaign_update` | 1 credit | Progress vs plan, gate checks, status |
| `account_status`, `buy_credits`, `delete_my_data` | free | Balance, checkout link, data deletion |
| `rotate_connector_url` | free | New connector URL; the old one stops working (for a leaked URL) |

Default packs (edit with `CREDIT_PACKS`): One strategy, 3 credits for ₦15,000 · Starter, 10 credits for ₦45,000 · Agency, 40 credits for ₦160,000.

When the balance is too low, the tool returns the account's checkout link (one live link per account). The user pays on Paystack (card, bank transfer, USSD), credits land through the webhook or the return page, and they ask Claude to run the tool again.

## Architecture

```
Claude (user's account) --MCP over HTTPS--> /mcp/<token>   (or /mcp + Authorization: Bearer <token>)
                                              |
                                  engine (pure TypeScript): comps, heat, pricing, funnel, budget, gates, rendering
                                              |
                                  SQLite: accounts (token hash), credits ledger, payments, saved plans
Browser --> /buy/<checkout> --> Paystack checkout --> /paid (verify) + /paystack/webhook (HMAC-verified) --> credits
```

- `src/engine/`: the methodology from the skill, as deterministic functions (tested against the repo's worked examples)
- `src/mcp.ts`: tool definitions and metering
- `src/store.ts`: SQLite storage with atomic charges and idempotent payment settlement
- `src/paystack.ts`: initialize, verify, webhook signature check
- `src/server.ts`: HTTP routes, rate limits, security headers, privilege drop
- `src/admin.ts`: owner command line for held payments, reconciliation, grants, reversals, URL rotation (see [GO-LIVE.md](GO-LIVE.md))

## Run locally

```bash
cd connector
npm ci
npm test              # engine, metering, payments, audit regressions, and end-to-end MCP runs
cp .env.example .env  # then edit; npm run dev loads it
npm run dev
```

Open `http://localhost:3000`, create a connector URL, and test it with any MCP client. Claude.ai needs a public HTTPS URL, so use a tunnel (for example `cloudflared tunnel --url http://localhost:3000`) and set `PUBLIC_BASE_URL` to it.

## Go live

Step-by-step, click by click: **[GO-LIVE.md](GO-LIVE.md)** (Paystack Starter Business, one-click Render deploy, test purchase, switch to live, payouts to your bank).

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/tobilobaadeyemo/claude-real-estate-exec-brief)

Summary:

1. **Paystack Nigeria.** Start as a Starter Business (BVN and ID, no CAC; ₦8M lifetime collections) or a Registered Business. Payouts settle in naira to your Nigerian bank account the next working day. Set the webhook URL to `https://<your-domain>/paystack/webhook`.
2. **Host.** `render.yaml` deploys the Docker image with a persistent disk at `/data`. Any other Docker host with a volume works too (Fly.io, Railway); set the variables from `.env.example`.
   ```bash
   docker build -t lagos-brief-connector connector
   docker run -p 3000:3000 -v brief-data:/data --env-file connector/.env lagos-brief-connector
   ```
3. **Domain and HTTPS.** Point a domain at the host; the platform terminates TLS.
4. **Test a live payment** with Paystack test keys first, then switch to live keys.
5. **Publish the URL.** Share `https://<your-domain>` (the landing page) in the README, `SHARE.md`, and posts.

## Security notes

- Connector tokens are 256-bit random values; only SHA-256 hashes are stored. The URL is shown once.
- Hosting platforms may log request paths, which contain the token. Restrict log access, or have header-capable clients use `/mcp` with `Authorization: Bearer`.
- Webhooks are accepted only with a valid `x-paystack-signature` (HMAC-SHA512), then re-verified with the Paystack API. Credits are granted once per reference, only for NGN, for exactly the pack price (fees passed to the buyer are fine), and only in the key's mode. Anything else is held for review and logged, never silently dropped. Partial refunds remove credits in proportion; chargebacks hold the credits until the dispute resolves.
- Credits from test-mode payments are voided on the first start with a live key; payments from before mode tracking are checked with Paystack and voided unless they are live.
- SQLite runs in WAL mode with `synchronous=FULL`, so a settlement acknowledged to Paystack survives a host crash.
- Charges are atomic and happen only after a result is computed and checked for finite numbers; balances cannot go negative.
- Free previews cost nothing to serve (no LLM call) and are limited to one per mailbox (case, +tags, and Gmail dots are ignored). Emails are not verified, so this deters rather than prevents repeat previews; email verification is on the roadmap.
- One live checkout link per account (expired links are purged hourly), JSON-RPC batches are refused, and rate limiters sweep on a timer with a capped key table that evicts the oldest entry, so a free account cannot fill the disk, slow the server, or lock other visitors out. Junk submissions on a buy link are rejected before they count against its owner.
- `/paid` shows only the credits a payment added, and calls Paystack at most once per 30 seconds per payment.
- User text is escaped in every table, so comp descriptions or channel names cannot rewrite computed figures.
- The container starts as root only to take ownership of the data directory and database files, and only inside `DATA_ROOT` (default `/data`), never following symlinks; then it drops to uid 1000 with no supplementary groups. In production the server refuses to start without a valid Paystack key and an https base URL.
- The rate limiter and SQLite assume a single instance. Move to Postgres and a shared limiter before scaling out.

## Roadmap

- OAuth sign-in (Claude supports OAuth with dynamic client registration) and email-based recovery for lost URLs
- Consent-based, anonymized closed-sale pool across subscribers: the dataset Lagos lacks, and the long-term moat
- Branded PDF and slide exports for paid briefs

## Legal checklist before launch

Terms of service and refund policy, privacy notice reviewed under the NDPA 2023, VAT treatment of digital services, and Paystack's acceptable-use terms. Have a Nigerian lawyer review them.
