# Claude Real Estate Exec Brief

This repository contains a full Claude skill for generating dense, executive-ready real estate briefs for a Lagos, Nigeria real estate company using live market data, internal property data, and comparables.

## Files
- `claude-real-estate-exec-brief.md` — complete skill specification and prompt pack

## Purpose
The skill helps management answer questions like:
- Is this property priced correctly?
- Is the market hot, warm, or cold?
- Which asset should we sell, hold, or lease?
- How is the portfolio performing versus market averages?

## What It Produces
- One-page executive snapshot
- Key findings and market trends
- Comparable sales table
- Risk and opportunity analysis
- Clear recommendation
- Immediate next steps

## Best Use Case
Use this for:
- property evaluation
- portfolio review
- pricing strategy
- investment decisions
- market monitoring

## Example Input
```json
{
  "query_type": "single_property",
  "property": {
    "address": "Plot 45, Admiralty Road, Lekki Phase 1",
    "type": "residential",
    "size_sqm": 450,
    "asking_price_ngn": 150000000,
    "status": "for_sale",
    "holding_period_months": 24
  },
  "time_period": "90_days",
  "decision_context": "hold_or_sell_decision"
}
```

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
| Estimated Days to Sell | 45 | 38 | Conversion is slower |
| Market Trend | +12% YTD | +9% YTD | Stronger demand |

## Recommendation
Hold and adjust pricing toward the market range.
```

## Full Skill
See `claude-real-estate-exec-brief.md` for the complete Claude-ready version.
