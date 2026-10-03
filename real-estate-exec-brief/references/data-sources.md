# Data Sources

Lagos has no public register of completed sale prices. Most public "market data" is asking prices. Build the evidence in this order and say which tier each number comes from.

## 1. Source map

| Tier | Source | What it actually gives you | Use for | Limits |
|---|---|---|---|---|
| 1 | Internal closed transactions | Closed price, list price, dates, days on market, concessions | Comps, asking-to-close discount, DOM | Small samples per micro-market |
| 1 | Internal CRM / lead log | Inquiries by channel and segment, conversion rates, response times, cost per lead | Funnel targets, budget, segment mix | Only as good as tagging discipline |
| 2 | Agent co-broke network | Agent-reported closed prices | Comps when internal deals are thin | Verbal; tag `[Closed: agent-reported]`, cap confidence at Medium |
| 2 | Paid industry data (for example Estate Intel, Northcourt), where licensed | Market reports, rent and price indices | Trend context, cross-checks | Lag; methodology varies; cite edition |
| 3 | Nigerian Property Centre (NPC) | Asking prices, listing counts, listing age | Supply, asking levels, listing-age proxy for DOM | Asking only; heavy duplication across agents; stale listings; built area often missing |
| 3 | PropertyPro.ng, Private Property Nigeria | Same as NPC | Cross-check and dedupe | Same as NPC |
| 3 | Portal rent listings | Asking rents | Lease fallback, yield | Asking only |
| Macro | CBN | Monetary policy rate, official FX rate (NFEM) | USD-equivalent pricing, financing context | Official rate can differ from what buyers actually pay |
| Macro | NBS | Headline CPI year on year | Real (inflation-adjusted) trends | Monthly release lag |
| Context | LASRERA | Practitioner registration, regulatory notices | Compliance checks | Not a price source |
| Context | Lagos State Lands Bureau / Land Registry (via solicitor) | Title search | Title verification | Not a price source; legal review required |
| Context | Google Maps / Places | Peak-hour drive times, nearby amenities | Location proof points | Measure at peak hours (weekday 07:00 to 09:00 and 17:00 to 20:00) |
| Context | NIHSA Annual Flood Outlook, Lagos State advisories, owner history | Flood exposure | Risk section, buyer objections | Area-level, not plot-level |
| Context | News on infrastructure (for example Lagos-Calabar Coastal Highway, Lekki Deep Sea Port, Lekki Free Trade Zone, Lagos Rail Mass Transit lines) | Micro-market catalysts | Opportunities, positioning | Cite article and date; separate announced from delivered |

## 2. Retrieval procedure

1. Check which tools this session has (web search/fetch, file uploads, connected drives or bases).
2. Pull internal data first. If not attached, ask for: closed deals (12 to 24 months), CRM lead export (12 months), cost per lead by channel, commission rate. Offer the templates in section 6.
3. Pull public data. Record URL, query or filter used, and as-of date for each source.
4. If no web access: ask the user to paste or upload portal exports and the latest CBN rate and NBS CPI. If still unavailable, produce the brief with `[DATA NEEDED]` markers and confidence Low. Never fill gaps with remembered figures.

## 3. Cleaning rules for portal data

- **Dedupe.** Treat listings as the same property when estate or street, bedroom count, and plot size match and prices are within 3%, or photos match. Keep the lowest price and the oldest listing date.
- **Stale.** Flag listings older than 180 days. Exclude them from the asking median; count them as a supply-overhang signal.
- **Incomplete.** Exclude listings without plot size from per-sqm calculations.
- **Outliers.** Exclude listings more than 40% from the segment median unless verified. Report how many were excluded.

## 4. Asking-to-close discount

- Compute from internal deals with both list and close price: median of (close / list - 1). Report n.
- If n < 5, show it but flag the discount as low-confidence.
- If there are no internal pairs, do not apply a default. Show asking medians as they are and state: "Closed prices typically sit below asking; magnitude unknown `[DATA NEEDED: list vs close pairs]`."

## 5. Source log format (goes in the brief's Sources section)

| Source | Data used | As of | Note |
|---|---|---|---|
| Internal closed deals | 3 comps, list-vs-close discount (n=11) | 2026-09-30 | Lekki Phase 1, 4 to 6 bed detached |
| NPC | 4 asking comps, 41 active listings | 2026-10-02 | Deduped from 63 raw |

## 6. Internal data formats

Templates live in `assets/data-templates/`. Any export with equivalent columns works; map names rather than asking the user to reformat.

**closed_deals.csv** (comps, list-to-close discount, days on market)
| Column | Meaning |
|---|---|
| deal_id | Internal reference |
| district, estate_or_street, street_tier | Location; street_tier is `inner_close` or `main_road` |
| property_type, bedrooms, plot_sqm, built_sqm | Physical attributes |
| title | `c_of_o`, `governors_consent`, `registered_deed`, `excision_gazette`, `none` |
| condition | `new`, `renovated`, `good`, `dated`, `shell` |
| transaction | `sale` or `lease` (for lease, prices are annual rent) |
| list_date, list_price_ngn | Launch date and price |
| close_date, close_price_ngn | Completion date and price |
| days_on_market | close_date minus list_date |
| concessions | Anything that changes the effective price |
| source | `internal` or `agent_reported` |

**crm_leads.csv** (segment mix, conversion rates, response times, objections)
| Column | Meaning |
|---|---|
| lead_id, listing_id, created_date | Identity and timing |
| channel | `npc`, `propertypro`, `meta`, `google`, `agent`, `crm`, `walk_in`, `referral` |
| segment | `local`, `diaspora`, `investor`, `corporate`, `developer` |
| price_band_ngn | Band the lead asked about |
| qualified, qualified_date | Meets the qualified-lead definition in `marketing-strategy.md` section 6 |
| viewing_date, offer_date, offer_ngn, closed | Funnel progress |
| first_response_minutes | Time to first reply |
| top_objection | `price`, `title`, `location`, `finish`, `service_charge`, `flood`, `other` |

**channel_costs.csv** (cost per qualified lead by channel)
| Column | Meaning |
|---|---|
| period_start, period_end, listing_id, channel | Scope |
| spend_ngn | Media plus listing fees for the period |
| impressions, clicks | Where the channel reports them |
| inquiries, qualified_leads | Outcomes attributed to the channel |

Data protection: CRM exports contain personal data. Work with the minimum columns needed, never copy names or phone numbers into a brief, and follow the company's NDPA 2023 retention rules.
