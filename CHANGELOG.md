# Changelog

## 1.3.0 (2026-10-03)

Pre-launch audit of the paid connector: 5 review dimensions, every finding adversarially verified (68 confirmed, 2 refuted). All confirmed findings fixed, with regression tests in `connector/test/hardening.test.ts`.

### Payments
- Credits granted on the requested amount, so "pass fees to customers" no longer strands buyers; mismatches are held for review (never terminal) and logged
- Test-mode payments refused on live keys; test credits voided on the first live start
- Refund and chargeback webhooks reverse credits
- `/paid` shows only this payment's credits, verifies at most every 30 s, and names the support email
- `synchronous=FULL` for crash-safe settlements; unsigned non-JSON webhooks get 401
- Admin CLI (`src/admin.ts`): review, reconcile, settle, grant, reverse, rotate, status

### Abuse and metering
- One live checkout link per account, hourly purge; JSON-RPC batches refused
- Rate limiter sweeps on a timer with a hard cap; unknown tokens refused before any per-token state; purchases limited per account; configurable proxy hops
- Re-running the same listing is free for 30 days; other audiences stay free
- Strict calendar dates and finite numbers; campaign updates refused before launch without charge
- Preview shows only data-gap flags; one preview per email; accurate billing messages; `rotate_connector_url` tool

### Engine
- List price kept inside the heat window; step kept within 3 to 5%; owner floor above market lists at the floor with no inverted band; keeping the ask keeps the ask; band edges drop just below (₦1.01B to ₦995M)
- Leadership-only figures (fee ratio, guardrail) never reach client, team, or preview; team never sees the floor
- Inclusive band edges; non-negative channel lines; incomplete budgets not totalled; contingency never ₦0
- Market brief: reprice needs the days-on-market test, no unsupported "Hold", liquidity sale needs a hot or warm market, triggers fit the action
- Campaign update: gates use their stated thresholds, offers scored from the price gate, past-close status, as-of date, objections
- Honest reads for missing data, lease wording, January diaspora window, table-cell escaping, money formatting at unit boundaries

### Follow-ups from the adversarial review of these fixes
- Pre-1.3 databases: 'rejected' payments become reviewable; payments from before mode tracking are checked with Paystack on a live start and voided unless live
- Partial refunds remove credits in proportion; chargebacks hold credits and restore them if the merchant wins
- Full rate limiters evict the oldest key instead of refusing new visitors
- Privilege drop only inside DATA_ROOT (default /data), refusing symlinked or outside directories
- Junk buy-link submissions no longer count against the account's purchase limit
- Proxy check runs on request (?proxy_check=1) with a GO-LIVE test that catches over-counting
- Free preview keyed by normalized mailbox (+tags, Gmail dots); signup limit 20 per IP per hour

### Operations
- Render deploys only after checks pass and ignores doc-only edits; keep-alive timeouts; listen failures exit non-zero; shutdown deadline; CI prints container logs on failure; `npm run dev` loads `.env`
- GO-LIVE: pass-fees guidance, private URL while on test keys, proxy check, accurate Payouts on Demand and foreign card fees, admin commands

## 1.2.0 (2026-10-03)

### Added
- One-click Render deploy (`render.yaml`) with a persistent disk, and `connector/GO-LIVE.md`: Paystack Starter Business setup, naira payouts to your bank, test purchase, switch to live, fees per pack
- Tests proving every Paystack request is NGN in kobo and non-naira settlements are rejected
- CI builds and boots the Docker image with a root-owned volume

### Changed
- Container drops from root to uid 1000 after taking ownership of the mounted disk
- Production refuses to start without a valid Paystack secret key; base URL falls back to Render's external URL

## 1.1.0 (2026-10-03)

### Added
- `connector/`: paid remote MCP connector for Claude. Deterministic engine for marketing strategy, market brief, and campaign update; free first preview; credits charged per call; Paystack checkout, verification, and HMAC-verified webhooks; SQLite ledger; Dockerfile; 16 tests including an end-to-end MCP run
- CI job for the connector (typecheck, test, build)

## 1.0.0 (2026-10-03)

### Added
- `marketing_strategy` mode (default): pricing plan, segments, positioning, trust stack, channel plan, budget, funnel targets, dated review gates, risks, compliance flags
- Leadership, client, and team versions from one analysis, with an audience matrix
- `campaign_update` mode: weekly progress against plan and gate checks
- Lease and portfolio variants; intake request template
- Presenter guide: talk structure, slide mapping, Q&A bank by audience
- Examples: leadership, client, and team versions of one listing; a market brief
- CSV templates for closed deals, CRM leads, and channel costs
- Test cases (`evals/test-cases.md`), validation script, CI, release workflow, feedback issue form

### Changed
- Packaged as a Claude skill (`real-estate-exec-brief/SKILL.md` with frontmatter and on-demand references)
- Market brief method: closed vs asking comps, two-step adjustments, nominal and real trends, explicit thresholds, heat score, confidence rating, per-source dates

### Fixed
- Example priced Lekki Phase 1 far below market; yield claimed on zero rent; "hold" recommended for a live sale

## 0.1.0

- Initial prompt specification for Lagos executive market briefs
