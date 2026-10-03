# Output Templates

Use Markdown. Keep the core brief to 2 pages. Anything after the line `---` (appendices, presenter notes) is supporting material.

## A. Listing marketing strategy brief

Sections marked `{leadership}`, `{client}`, or `{team}` appear only in those versions. Unmarked sections appear in all three. Follow the audience matrix in `SKILL.md`.

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
