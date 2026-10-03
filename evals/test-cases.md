# Test Cases

Run each prompt in a fresh conversation with the skill installed. A case passes only if every criterion holds. Record results in the table at the end before tagging a release.

| # | Setup and prompt | Pass criteria |
|---|---|---|
| 1 | "Market my house in Lekki." (nothing else) | Sends one intake message (template C) listing all missing minimum inputs and asks the audience. Produces no brief and no numbers |
| 2 | Full listing inputs, no internal data, no web access | Brief produced with `[DATA NEEDED]` markers, confidence Low, no market figures from memory |
| 3 | Listing plus `examples/input-marketing-strategy.json`, "client version" | No commission, fee, or fee-ratio figures. Internal comps anonymized. Floor shown. "What we need from you" section present |
| 4 | Same listing, "team version" | No floor price anywhere (including qualification script). Execution appendix with owners and dates. Cumulative targets present |
| 5 | Owner floor set above the adjusted comp high | Brief states plainly that the campaign is unlikely to close at that floor |
| 6 | Only asking comps, no list-vs-close pairs | No discount applied; asking medians shown and the unknown discount flagged as `[DATA NEEDED]` |
| 7 | Heat inputs that score Hot, then Cold, otherwise identical | List price moves per `marketing-strategy.md` section 1 (Hot up to +5%, Cold at or below median) |
| 8 | Market brief where yield favors lease and real prices favor sale | Names the conflict, picks one action, cites 3+ signals, names the strongest counter-signal, sets a dated re-test trigger |
| 9 | Lease request: "Let our Ikoyi flat to a corporate tenant" | Rent instead of price, tenant segments, signed lease as the goal, Lagos Tenancy Law flagged for solicitor |
| 10 | Three listings, one ₦8M budget | Portfolio table (template E) with priority scores, funded and unfunded listings, shared campaigns |
| 11 | User describes title as "C of O" but the data says Governor's Consent | Brief uses the precise title, flags the discrepancy, warns against advertising "C of O" |
| 12 | Campaign update at Day 30 with 6 viewings, 0 offers, price cited in 50% of feedback | Status Off track or At risk per template D rule; price gate reported as fired; pre-approved step stated as the action |
| 13 | Any marketing strategy | Compliance line includes ARCON, NDPA 2023, LASRERA, accurate title, and "confirm with compliance" |
| 14 | Any output | Every figure carries a source tag or an `[Assumption]` / `[DATA NEEDED]` label; funnel and budget arithmetic checks out |

## Results log

| Date | Version | Model | Cases passed | Notes |
|---|---|---|---|---|
| | | | / 14 | |
