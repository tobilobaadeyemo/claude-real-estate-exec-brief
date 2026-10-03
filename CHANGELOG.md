# Changelog

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
