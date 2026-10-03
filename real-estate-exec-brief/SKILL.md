---
name: real-estate-exec-brief
description: Builds presentation-ready briefs for a Lagos, Nigeria real estate company. Two modes. (1) Listing marketing strategy: price position, list price and negotiation band, target buyer or tenant segments, positioning, channel plan, budget, funnel targets, review gates, risks, and presenter notes, in leadership, client (property owner), or marketing-team versions. (2) Market brief: hold, sell, lease, or reprice decision for a property or portfolio. Use when asked to market, price, launch, or relaunch a listing; plan a property campaign; prepare a property presentation or pitch for management, an owner, or the marketing team; or benchmark a Lagos property or portfolio against the market.
---

# Real Estate Exec Brief (Lagos)

Turns company property data and market data into a short, evidence-backed brief that an in-house marketing strategist presents. Every number is sourced or labeled as an assumption. Every recommendation has a dated trigger for what happens if it does not work.

## Modes

| Mode | Use when | Core question | Template |
|---|---|---|---|
| `marketing_strategy` (default) | A listing or set of listings must be sold or let | How do we price, position, and market this to close on time and on budget? | `references/output-templates.md` section A |
| `market_brief` | Hold / sell / lease / reprice decision, portfolio review | Is this asset priced right, and what should we do with it? | `references/output-templates.md` section B |

Infer the mode from the request. A marketing strategy already contains the market position, so do not produce both unless asked.

## Audience versions (marketing_strategy)

The presenter works for the company. The same analysis is cut three ways:

| Section | `leadership` | `client` (property owner / developer) | `team` (marketing + sales) |
|---|---|---|---|
| Bottom line | Yes | Yes | Yes |
| Market position | Yes | Yes | Short |
| Pricing: list price, step rule | Yes | Yes | Yes |
| Pricing: floor price | Yes | Yes | No (authorized negotiators only) |
| Segments and positioning | Yes | Yes | Yes |
| Channel plan | Full | Summary | Full |
| Budget | Full, plus % of expected fee | Total, plus anything the owner pays | Per-channel lines |
| Funnel targets and KPIs | Yes | Yes | Yes, plus weekly targets |
| Timeline and review gates | Yes | Yes | Yes, plus task owners |
| Risks and mitigations | Yes | Owner-relevant only | Operational |
| Decisions needed | Approvals | Owner sign-offs and documents | Owners and deadlines |
| Commission and fee economics | Yes | Never | Never |
| Execution appendix | No | No | Yes |
| Comparables appendix | Yes | Yes | Yes |
| Presenter notes | Yes | Yes | Yes |

If the audience is not stated, ask once. If there is still no answer, produce `leadership` and add a three-line note on what changes for `client` and `team`.

## Inputs

Minimum to proceed (ask for all gaps in one message; never guess these):
- Location: district plus estate or street (and LGA if known)
- Property type, bedrooms, plot size (sqm), built-up area (sqm) if known
- Owner's asking price (sale) or asking rent (lease)
- Title status (for example C of O, Governor's Consent, registered deed, excision/gazette, none)
- Transaction: sale or lease
- Target close date or window

Useful, not blocking: condition, amenities, photos, owner's floor price, internal closed deals, CRM funnel and cost-per-lead history, commission rate, budget cap, owner constraints (viewing access, timeline, confidentiality).

Structured input example: `examples/input-marketing-strategy.json`.

## Workflow

1. **Classify.** Mode, audience, sale or lease, single listing or portfolio.
2. **Gather data.** Follow `references/data-sources.md`. Use the tools this session has: web search and fetch for public sources; connected drives, bases, or uploaded files for internal records. Log each source with its as-of date.
3. **Price position.** Build the comp set, adjust, compute premium, heat score, and confidence per `references/market-analysis.md`.
4. **Strategy.**
   - `marketing_strategy`: pricing plan, segments, positioning, channels, budget, funnel, timeline, review gates, fallback, per `references/marketing-strategy.md`.
   - `market_brief`: apply the decision rules in `references/market-analysis.md` section 7.
5. **Draft** in the template for the chosen mode and audience.
6. **Presenter notes.** Add per `references/presenter-guide.md` unless the user opts out.
7. **Quality gate.** Run the checklist below. Fix every failure before output.

## Non-negotiable rules

- **No invented numbers.** Every figure carries a source tag: `[Internal]`, `[Closed: internal]`, `[Closed: agent-reported]`, `[NPC asking]`, `[PropertyPro asking]`, `[CBN]`, `[NBS]`, `[Est.]`, or `[Assumption]`. Missing data becomes `[DATA NEEDED: what, from whom]`.
- **Asking is not sold.** Portal listings are asking prices. Label every comp `closed` or `asking`. Never call asking prices "sales".
- **Nominal and real.** Report price and rent trends in nominal terms and real terms (deflated by NBS headline CPI, year on year).
- **Land vs built.** Never mix price per sqm of plot with price per sqm of built-up area. State which one is used.
- **Dates, not freshness claims.** Give an as-of date per source. Do not write "updated X hours ago".
- **Confidence.** State High, Medium, or Low with the reason (comp count, closed vs asking, missing inputs).
- **One recommendation.** A fallback is allowed only as a dated trigger: "If X by date, then Y."
- **Client version hygiene.** Never show commission split, internal margin, agent performance, other clients' data, or the internal fee-to-budget ratio.
- **Qualified review.** Title, legal, tax, and formal valuation questions are flagged for a solicitor or a registered estate surveyor and valuer. Do not opine on whether a title is valid.
- **Compliance flags in every marketing plan.** ARCON pre-exposure vetting for paid adverts (including digital and influencer), NDPA 2023 lawful basis and opt-out for lead data and broadcast messages, LASRERA registration for practitioners on the deal. Tell the user to confirm current requirements with compliance.

## Quality gate

Before output, confirm every line:
- [ ] Bottom line states price, primary segment, close target, and budget ask in 3 lines or fewer
- [ ] Every number has a source tag or an `[Assumption]` / `[DATA NEEDED]` label
- [ ] Comps labeled closed or asking; asking-to-close adjustment shown or flagged as unknown
- [ ] Price trend shown nominal and real
- [ ] Recommendation cites at least 3 supporting signals and names the strongest counter-signal
- [ ] Funnel targets back-solve to the close target (arithmetic checks)
- [ ] Budget lines sum to the total
- [ ] Every review gate has a date, a metric threshold, and an action
- [ ] Risks have mitigations and owners
- [ ] Compliance flags present (marketing_strategy)
- [ ] Audience matrix respected (nothing from a "No" or "Never" cell leaks into that version)
- [ ] Core brief fits 2 pages; team appendix and presenter notes come after it
- [ ] No contradictions between sections (for example "hold" alongside a live sale campaign)

## Reference files

Read only what the current step needs.

| File | Read when |
|---|---|
| `references/data-sources.md` | Gathering data; deciding what a source can and cannot prove |
| `references/market-analysis.md` | Building comps, heat score, confidence; market_brief decision rules |
| `references/marketing-strategy.md` | Pricing plan, segments, positioning, channels, budget, funnel, gates, compliance |
| `references/output-templates.md` | Drafting the final brief |
| `references/presenter-guide.md` | Writing presenter notes and anticipated Q&A |
| `examples/` | Calibrating format and depth |
