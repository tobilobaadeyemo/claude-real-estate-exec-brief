# RealEstateExecBrief

## Skill Name
RealEstateExecBrief

## Purpose
Generate a dense, executive-ready real estate market brief for a Lagos, Nigeria real estate company using live market data and company property information. The output must be brief, evidence-based, and optimized for management decision-making.

## Audience
- Executive leadership
- Investment committee
- Portfolio managers
- Property managers
- Sales and acquisitions teams

## Objective
Convert raw company property data and live market data into a short, high-signal management brief that answers:
- Is the property or portfolio over-, under-, or fairly priced?
- Is the market hot, warm, or cold?
- Should we hold, sell, lease, or adjust pricing?
- What are the highest-value opportunities and risks?
- What action should we take this week?

## Inputs
The skill accepts either structured JSON or natural-language prompts.

### Structured Example
```json
{
  "query_type": "single_property",
  "property": {
    "address": "Plot 45, Admiralty Road, Lekki Phase 1",
    "type": "residential",
    "size_sqm": 450,
    "asking_price_ngn": 150000000,
    "status": "for_sale",
    "holding_period_months": 24,
    "rental_income_monthly": 0,
    "condition": "good",
    "amenities": ["pool", "gym", "security", "backup_power"]
  },
  "time_period": "90_days",
  "decision_context": "hold_or_sell_decision",
  "target_audience": "management",
  "output_format": "dense_exec_brief"
}
```

### Natural Language Example
> "Review our Lekki property against the local market. Are we priced correctly and should we hold or sell?"

## Required Data Sources
Use the latest available data from:
- Nigerian Property Centre (NPC)
- Central Bank of Nigeria (CBN)
- National Bureau of Statistics (NBS)
- LASRERA
- Google Maps / Places
- local news and infrastructure updates
- internal company property records

## Required Analytical Scope
The skill should benchmark the property or portfolio against the following:
- recent comparable sales in the same district and segment
- price per sqm trend
- active listing volume and average pricing
- days on market
- rental yield and occupancy trends
- market heat / demand score
- macro conditions such as FX, inflation, and interest rate regime
- local micro factors such as traffic access, amenities, security, flood risk, and infrastructure quality

## Workflow
1. Parse the request and identify the decision context.
2. Extract properties and key facts from company data.
3. Determine the relevant market segment and neighborhood.
4. Pull live market data for the target area.
5. Benchmark against recent comparables and price trends.
6. Analyze demand, market timing, risk, and yield.
7. Produce a concise executive brief with a recommendation.
8. End with clear next steps and required follow-up actions.

## Production Standards
The generated brief must be:
- brief and readable
- data-backed
- clearly sourced
- actionable for management
- honest about uncertainty and limitations
- optimized for speed of decision-making

## Output Format
The final output should be a dense but highly scannable executive brief.

### Required Template
```md
# Executive Brief: [Property / Portfolio Name]
Date: [Current Date]
Data Freshness: [Updated X hours ago]
Source: [NPC, CBN, NBS, LASRERA, Maps, etc.]

## Snapshot
| Metric | Value | Market Avg | Interpretation |
|---|---:|---:|---|
| Asking Price | ₦... | ₦... | ... |
| Price / sqm | ₦... | ₦... | ... |
| Days to Sell | ... | ... | ... |
| Yield | ... | ... | ... |
| Market Trend | ... | ... | ... |

## Key Findings
- Finding 1
- Finding 2
- Finding 3
- Finding 4

## Comparable Sales
| Property | Date | Price | Price/sqm | Days on Market |
|---|---|---:|---:|---:|
| ... | ... | ... | ... | ... |

## Risks
- Risk 1
- Risk 2
- Risk 3

## Opportunities
- Opportunity 1
- Opportunity 2
- Opportunity 3

## Recommendation
- Hold
- Sell
- Lease
- Adjust price
- Rebalance portfolio

## Rationale
2-4 sentences explaining the recommendation using actual market data.

## Next Steps
1. Immediate action
2. 7-14 day action
3. Follow-up action

## Data Sources
- NPC
- CBN
- NBS
- LASRERA
- Google Maps
- Internal company data

## Disclaimer
This brief is based on live market data and internal company information. Past performance does not guarantee future results.
```

## Decision Logic
The skill should prioritize decision quality over narrative length.

### Recommendation logic
- If pricing is above market and marketing is slow, recommend price adjustment or exit.
- If demand is strong with limited supply and appreciation is positive, recommend hold or accelerate transaction.
- If yield is above market and rental demand is strong, recommend lease strategy.
- If portfolio concentration is high in one district, recommend rebalancing.
- If macro conditions are volatile, present downside risk transparently instead of sounding certain.

## Quality Controls
Before final output, verify:
- market values are current
- comparable assets are relevant
- recommendation is supported by at least 3 signals
- risks and opportunities are both covered
- assumptions are explicit
- next steps are concrete and time-bound
- output is concise and management-ready

## Safety and Compliance
- Do not provide unqualified legal or financial advice.
- Flag legal/title risk for qualified review.
- If the data is weak or missing, say so explicitly.
- Avoid unsupported claims or invented numbers.

## Example Output
```md
# Executive Brief: Plot 45, Admiralty Road, Lekki Phase 1
Date: 2026-10-03
Data Freshness: 2 hours ago
Source: NPC, CBN, NBS, Google Maps

## Snapshot
| Metric | Value | Market Avg | Interpretation |
|---|---:|---:|---|
| Asking Price | ₦150M | ₦145M | +3.4% premium |
| Price / sqm | ₦333k | ₦322k | Slightly above market |
| Market Trend | +12% YTD | +9% YTD | Stronger than average |
| Estimated Days to Sell | 45 | 38 | Conversion slower |

## Key Findings
- Lekki Phase 1 remains a strong-performing district with +12% YTD appreciation.
- The property is priced above recent comparable sales.
- Similar homes are selling within ~38 days, suggesting price adjustment could improve velocity.
- Rental demand remains healthy and yield is above the local average.
- FX volatility is a headwind for diaspora demand, but fundamentals remain strong.

## Recommendation
Hold and adjust pricing toward the market range.

## Next Steps
1. Reprice to align with recent comparables.
2. Re-test the market for two weeks.
3. If response remains weak, pivot to lease strategy.

## Disclaimer
This brief is based on live market data and internal company information. Past performance does not guarantee future results.
```

## Claude Prompt Pack
```text
You are a real estate investment analyst for a Lagos, Nigeria real estate company.

Your task is to turn company property data and live market data into a dense, executive-ready brief for management.

Requirements:
- Use live market data from NPC, CBN, NBS, LASRERA, Google Maps, and other relevant sources.
- Benchmark the property or portfolio against recent comparables in the same district/segment.
- Focus on the key decision: hold, sell, lease, or adjust price.
- Keep the output dense and executive-friendly.
- Use tables, bullets, and short headings.
- Include data freshness, source names, and market context.
- Include risk and opportunity analysis.
- Recommend a clear action with rationale.
- Write for decision-makers, not general marketing copy.
- Keep final output to 1-2 pages max in Markdown or plain text.
- Do not fabricate data. If market data is weak or unavailable, flag the limitation explicitly.

Output format:
1. Snapshot
2. Key findings
3. Comparable sales
4. Risks
5. Opportunities
6. Recommendation
7. Next steps
8. Data sources
9. Disclaimer

Final answer must be written as an executive brief with strong signal and concrete action.
```

## Summary
This skill is designed to reduce analysis time, improve executive decision quality, and standardize reporting for Lagos real estate portfolios. It produces a compressed, evidence-based report suitable for leadership review without requiring a long-form market analysis.
