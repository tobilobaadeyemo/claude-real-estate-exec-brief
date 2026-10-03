# Market Analysis Method

All thresholds below are defaults. If the company has calibrated its own, use those and say so.

## 1. Comparable set

Start narrow, widen only as needed, and record every widening (each one lowers confidence).

| Filter | Default | Widening order |
|---|---|---|
| Location | Same district, same street tier (inner close vs main road) | 3rd: adjacent district of the same price tier |
| Type | Same type (detached, semi-detached, terrace, flat, land) | Never widen across types |
| Size | Plot within +/-25% | 4th: +/-40% |
| Bedrooms | +/-1 | Hold |
| Time | Closed within 12 months; asking listed within 180 days | 1st: closed within 24 months |
| Count | At least 5 comps, at least 3 of them closed | 2nd: accept asking comps with the discount applied |

## 2. Adjustments

Adjust each comp to the subject in two steps, and show every adjustment in the comps appendix with a one-line reason:
1. Asking comps only: closed-equivalent = asking x (1 + asking-to-close discount).
2. All comps: adjusted = closed or closed-equivalent price x (1 + sum of attribute adjustments).

| Factor | Direction | Evidence needed |
|---|---|---|
| Asking to close | Apply internal discount to asking comps | `data-sources.md` section 4 |
| Plot size | Pro-rata on land component | Plot sizes |
| Bedrooms / built area | Per bedroom or per built sqm | Built area or bedroom count |
| Condition / finish | Renovated vs dated vs shell | Photos, renovation date |
| Title | C of O / Governor's Consent / registered deed vs excision-gazette only vs none | Title status. Weak or no title: do not price-adjust; flag for legal review and exclude the comp if unresolved |
| Power, water, BQ, pool | Spec differences | Listing detail |
| Street position | Inner close vs busy road | Maps |
| Flood exposure | Known flooding vs none | Owner history, advisories |

No evidence for a factor: do not adjust. Note it as a qualitative difference instead.

## 3. Price position

- Premium = subject asking / adjusted comp median - 1.
- Report the adjusted comp range (min to max) and median.

| Premium | Position | Implication |
|---|---|---|
| Below -5% | Below market | Fast sale likely; check for underpricing or a hidden defect |
| -5% to +5% | At market | Price is not the main lever |
| +5% to +10% | Premium | Needs 2 or more documented differentiators to hold |
| Above +10% | Overpriced | Expect slow inquiry and stale listing unless repriced |

**Per sqm.** Use price per sqm of plot when built area is missing for most comps (common in Lagos listings). Use price per built sqm only when every comp has it. Label which one.

## 4. Real trends and USD view

- Real change = (1 + nominal change) / (1 + CPI YoY) - 1. Use NBS headline CPI for the matching month.
- USD equivalent = naira price / CBN official rate on the as-of date. Show the 12-month USD change for diaspora audiences, because they compare in their earning currency.

## 5. Market heat score

Five signals, each scored +1 / 0 / -1 for the subject's segment (district plus type plus size band):

| Signal | +1 | 0 | -1 |
|---|---|---|---|
| Real price change, 12 months | Above +3% | -3% to +3% | Below -3% |
| Median days on market vs 12 months ago | Down more than 15% | Within 15% | Up more than 15% |
| Active deduped listings vs 12 months ago | Down more than 10% | Within 10% | Up more than 10% |
| Qualified inquiries per listing, last 90 days vs prior 90 (internal) | Up more than 15% | Within 15% | Down more than 15% |
| Real rent change, 12 months | Above +3% | -3% to +3% | Below -3% |

Total of +2 or more = **Hot**. -1 to +1 = **Warm**. -2 or less = **Cold**.
If a signal is unavailable, drop it and say so. With 3 or fewer signals, report heat as "indicative".

DOM where no internal data exists: use portal listing age as a proxy and label it "listing-age proxy".

## 6. Confidence

| Level | Conditions |
|---|---|
| High | 5 or more closed comps within 12 months, no widening beyond step 1, all minimum inputs present |
| Medium | 3 or 4 closed comps, or 5 or more comps that are mostly asking with a measured discount, or one widening beyond step 1 |
| Low | Fewer than 3 closed comps and fewer than 5 total, or the discount unknown, or any minimum input missing |

## 7. Market brief decision rules (`market_brief` mode)

Choose one action. Cite at least 3 supporting signals and name the strongest counter-signal.

| Condition | Action |
|---|---|
| Overpriced (above +10%) and DOM above 1.5x segment median | Reprice into the adjusted comp range, or exit |
| Hot or Warm, at or below market, owner objective is liquidity | Sell now at market |
| Hot, real price trend positive, holding cost below expected real appreciation | Hold |
| Gross yield at least 1 point above segment median, rent trend stable or rising | Lease |
| Cold, and annual holding cost (finance + service charge + maintenance + opportunity cost) above expected real appreciation | Sell |
| Any single district above 40% of portfolio value | Flag rebalancing alongside the asset action |
| Signals conflict | State the conflict, pick the action with the better downside, and set a dated re-test trigger |

Gross yield = annual rent / price. Net yield = (annual rent - service charge - maintenance - vacancy allowance) / price. Show which one.
