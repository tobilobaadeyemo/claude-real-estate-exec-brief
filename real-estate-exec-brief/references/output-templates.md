# Output Templates

Use Markdown. Keep the core brief to 2 pages. Anything after the line `---` (appendices, presenter notes) is supporting material.

## A. Listing marketing strategy brief

Sections marked `{leadership}`, `{client}`, or `{team}` appear only in those versions. Unmarked sections appear in all three. Follow the audience matrix in `SKILL.md`.

**Lease variant substitutions:** Price becomes annual rent (state advance-rent terms). Buyer becomes tenant. Close becomes signed lease. Offers become applications that pass screening. Add a line on lease term, service charge, and Lagos Tenancy Law checks for the solicitor. Expected fee uses the agreed letting fee basis.

```md
# Marketing Strategy: [Listing name / ID], [District]
Prepared by: [Presenter name, title] | Version: [Leadership / Client / Team] | Date: [YYYY-MM-DD]
Data as of: [earliest source date] | Confidence: [High / Medium / Low] ([reason])

## Bottom Line
- **Price:** List at ₦[X] (owner ask ₦[Y], [+/-Z]% vs adjusted market median ₦[M]).
- **Buyer:** [Primary segment], with [secondary] as secondary.
- **Plan:** Close by [date] on a ₦[B] budget, with a pre-agreed price step on [date] if [trigger].

## Market Position
| Metric | Subject | Market | Read |
|---|---:|---:|---|
| Price | ₦[ask] | ₦[median] adj. median ([range]) | [Position band] |
| Price / sqm ([plot or built]) | ₦[x] | ₦[y] | ... |
| Price trend, 12m | n/a | [+x]% nominal / [y]% real | ... |
| Days on market | [n or n/a] | [median] | ... |
| Market heat | n/a | [Hot / Warm / Cold] ([score]) | [driving signals] |
| USD equivalent | $[x] | $[y] | [only if diaspora targeted] |

## Pricing Plan
| Item | Value | Basis |
|---|---:|---|
| List price | ₦... | ... |
| Floor {leadership}{client} | ₦... | ... |
| Negotiation band {leadership}{client} | ₦... to ₦... | ... |
| Price step | ₦... on [date] | Trigger: ... |

## Target Buyers and Positioning
**Primary:** [segment]: [why, with CRM evidence]
**Secondary:** [segment]: [why]
**Positioning:** [one line]
**Proof points:** 1. ... 2. ... 3. ...
**Trust stack:** [title type], [search report on request], [solicitor-held funds], [live video viewing]

## Channel Plan
| Channel | Role | Segment | Budget | Target |
|---|---|---|---:|---:|
| ... | ... | ... | ₦... | [n] inquiries |
{client}: replace with a 3-line summary of where the property will be seen.

## Budget
| Line | Amount |
|---|---:|
| Lead generation (variable) | ₦... |
| Production and events (fixed) | ₦... |
| Contingency | ₦... |
| **Total** | **₦...** |
{leadership}: Expected fee ₦[F] ([rate] x ₦[expected close]); budget = [x]% of fee.
{client}: State what, if anything, the owner pays.

## Funnel Targets
| Stage | Target | Conversion basis |
|---|---:|---|
| Inquiries | ... | ... |
| Qualified leads | ... | ... |
| Viewings | ... | ... |
| Offers | ... | ... |
| Close | 1 | by [date] |

## Timeline and Review Gates
| Date | Gate | Threshold | Action |
|---|---|---|---|
| ... | ... | ... | ... |

## Risks and Mitigations
| Risk | Likelihood | Mitigation | Owner |
|---|---|---|---|
| ... | H / M / L | ... | ... |

## Decisions Needed
{leadership}: approvals (price, step rule, budget, segments)
{client}: owner sign-offs (price, floor, step rule), documents, viewing access
{team}: task owners and deadlines

## Compliance
ARCON vetting for paid adverts | NDPA consent and opt-out for lead data | LASRERA registration for practitioners | Accurate title description. Confirm current requirements with compliance before launch.

## Sources and Assumptions
| Source | Data used | As of |
|---|---|---|
| ... | ... | ... |
Assumptions: [list every `[Assumption]` used]

---

## Appendix 1: Comparables
| # | Property | Status | Date | Price | Adjustments | Adjusted | Source |
|---|---|---|---|---:|---|---:|---|
| C1 | ... | Closed | ... | ₦... | ... | ₦... | ... |
| A1 | ... | Asking | ... | ₦... | ... | ₦... | ... |
Excluded: [n stale, n duplicates, n outliers]

## Appendix 2: Execution Plan {team}
| Task | Owner | Due | Done when |
|---|---|---|---|
| ... | ... | ... | ... |
Weekly dashboard: [fields from marketing-strategy.md section 6]
Lead handling: [response SLA, qualification script, CRM tags, UTM convention]

## Presenter Notes
[See presenter-guide.md]
```

## B. Market brief (hold / sell / lease / reprice)

```md
# Market Brief: [Property / Portfolio]
Prepared by: [Name] | Date: [YYYY-MM-DD] | Data as of: [date] | Confidence: [level] ([reason])

## Recommendation
**[One action]**: [one sentence why]. Re-test on [date] if [trigger].

## Snapshot
| Metric | Subject | Market | Read |
|---|---:|---:|---|
| Price | ... | ... | ... |
| Price / sqm ([plot or built]) | ... | ... | ... |
| Price trend, 12m | ... | [nominal] / [real] | ... |
| Days on market | ... | ... | ... |
| Yield ([gross or net]) | ... | ... | ... |
| Market heat | ... | ... | ... |

## Evidence
Supporting signals (3 minimum):
1. ...
2. ...
3. ...
Strongest counter-signal: ...

## Risks and Opportunities
| Type | Item | Impact | Response |
|---|---|---|---|
| Risk | ... | ... | ... |
| Opportunity | ... | ... | ... |

## Next Steps
| Action | Owner | Due |
|---|---|---|
| ... | ... | ... |

## Sources and Assumptions
| Source | Data used | As of |
|---|---|---|

---
## Appendix: Comparables
[Same table as A, Appendix 1]

Not legal, tax, or formal valuation advice. Title and legal matters require solicitor review; formal valuations require a registered estate surveyor and valuer.
```

## C. Intake request (minimum inputs missing)

Send once, listing every gap. Do not draft the brief until price, size, title, and location are known.

```md
To build the [marketing strategy / market brief] for [listing], I need:

**Required**
- [ ] Exact location: district plus estate or street
- [ ] Type, bedrooms, plot size (sqm), built-up area (sqm) if known
- [ ] Owner's asking price (or asking rent) and floor, if there is one
- [ ] Title status (C of O, Governor's Consent, registered deed, excision/gazette, none)
- [ ] Sale or lease, and the target close date

**Strongly recommended** (templates attached if you need a format)
- [ ] Closed deals, last 12 to 24 months (closed_deals.csv)
- [ ] CRM lead export, last 12 months (crm_leads.csv)
- [ ] Spend and leads by channel (channel_costs.csv)
- [ ] Commission or fee rate, budget cap

**Who is this for?** Leadership, the property owner, or the marketing team?

Without the recommended data I can still build it, but confidence will be Low and gaps will be marked.
```

## D. Weekly campaign update (`campaign_update`)

One page. Compare cumulative actuals to the plan's cumulative pro-rata targets.

```md
# Campaign Update: [Listing], Week [n] (Day [d] of [total])
Prepared by: [Name] | Period: [start] to [end] | Status: [On track / At risk / Off track]

## Bottom Line
[One sentence: where we are vs plan.] [One sentence: gate result or decision needed.]

## Funnel vs Plan (cumulative)
| Stage | Plan to date | Actual | % of plan |
|---|---:|---:|---:|
| Inquiries | ... | ... | ... |
| Qualified leads | ... | ... | ... |
| Viewings | ... | ... | ... |
| Offers | ... | ... | ... |

## Spend and Efficiency
| Channel | Spend to date | Qualified leads | Cost per qualified lead | vs target |
|---|---:|---:|---:|---|
| ... | ₦... | ... | ₦... | ... |

## What Buyers Are Saying
Top 3 objections from viewing feedback, with the share of viewings citing each.

## Gate Check
| Gate | Due | Threshold | Result | Action |
|---|---|---|---|---|
| ... | ... | ... | Fired / Not fired / Not yet due | ... |

## Changes This Week
- [Creative, targeting, budget shifts, and why]

## Next Week
- [Actions with owners]
```

Status rule: On track if every stage is at 80% or more of plan; At risk if any stage is between 50% and 79%; Off track if any stage is below 50% or a gate fired without its action taken.

## E. Portfolio allocation (several listings, one budget)

```md
## Budget Allocation: [Portfolio], [period]
| Rank | Listing | Expected fee | P(close in window) | Marketing cost | Priority score | Funded |
|---:|---|---:|---:|---:|---:|---|
| 1 | ... | ₦... | ...% | ₦... | ... | Yes |
Priority score = expected fee x P(close) / marketing cost.
Shared campaigns: [segment: listings grouped]
Unfunded: [listing: what it would take]
```
