# Real Estate Exec Brief: a Claude skill for Lagos property marketing

A Claude skill that turns a listing and your company's sales data into a **marketing strategy brief your strategist can present**: price position, list price and negotiation band, target buyers, positioning, channel plan, budget, funnel targets, review gates, risks, and presenter notes with likely Q&A.

Built for Lagos, Nigeria real estate teams. It handles Lagos-specific issues such as asking prices vs closed prices, naira vs USD for diaspora buyers, real vs nominal returns, title trust, and ARCON / NDPA / LASRERA compliance.

**[Download the skill (.zip)](https://github.com/tobilobaadeyemo/claude-real-estate-exec-brief/raw/main/dist/real-estate-exec-brief.zip)** · [See a full example brief](real-estate-exec-brief/examples/output-marketing-strategy-leadership.md)

---

## What you get

| Mode | Question it answers | Output |
|---|---|---|
| **Marketing strategy** (default) | How do we price, position, and market this listing to close on time and on budget? | 2-page brief + comps appendix + presenter notes |
| **Market brief** | Should we hold, sell, lease, or reprice this asset or portfolio? | 1 to 2-page decision brief |

Each marketing strategy comes in three versions from the same analysis:

| Version | For | Differences |
|---|---|---|
| `leadership` | CEO, investment committee, heads of sales | Full economics, budget as % of expected fee, approvals needed |
| `client` | Property owner or developer | No commission or internal margins; owner sign-offs and documents needed |
| `team` | Marketing and sales | Execution plan with owners, weekly KPI targets, lead-handling rules |

## Why it holds up in the room

- **No invented numbers.** Every figure is tagged with its source, or marked `[Assumption]` or `[DATA NEEDED]`.
- **Asking is not sold.** Portal prices are labeled as asking and adjusted with your own list-to-close history.
- **Real returns.** Price and rent trends are shown both before and after inflation.
- **Decisions with triggers.** Each plan has dated review gates (Day 14, 30, 60) and a pre-agreed price step, so a later price cut is a rule being followed, not a surprise.
- **Presenter-ready.** Includes a 60-second opening, the three numbers to remember, and answers to likely objections from each audience.

## Install

**Claude.ai / Claude Desktop**
1. Download [`real-estate-exec-brief.zip`](https://github.com/tobilobaadeyemo/claude-real-estate-exec-brief/raw/main/dist/real-estate-exec-brief.zip).
2. In Claude, open **Settings > Capabilities > Skills**, then upload the zip. (Skills must be enabled for your plan or workspace.)

**Claude Code**
```bash
git clone https://github.com/tobilobaadeyemo/claude-real-estate-exec-brief
mkdir -p ~/.claude/skills
cp -r claude-real-estate-exec-brief/real-estate-exec-brief ~/.claude/skills/
```

## Use

Attach what you have (closed deals, CRM lead export, listing details), then ask in plain language:

> "Build a leadership marketing strategy for our 5-bed detached house in Lekki Phase 1. Owner is asking ₦650M, floor ₦560M, Governor's Consent, 450 sqm plot. We want it sold in 90 days. Our closed deals and CRM export are attached."

> "Now give me the client version for the owner meeting."

> "Market brief: should we hold or sell our Ikoyi flats portfolio?"

Structured input example: [`examples/input-marketing-strategy.json`](real-estate-exec-brief/examples/input-marketing-strategy.json)

**Best results** come from attaching your own closed deals and CRM data. Without them, the skill still runs, but it says where data is missing and marks confidence Low.

## Files

```
real-estate-exec-brief/
  SKILL.md                      # entry point: modes, audiences, rules, quality gate
  references/
    data-sources.md             # what each Lagos data source can and cannot prove
    market-analysis.md          # comps, adjustments, heat score, confidence, decision rules
    marketing-strategy.md       # pricing, segments, positioning, channels, budget, funnel, gates, compliance
    output-templates.md         # brief templates for each mode and audience
    presenter-guide.md          # talk structure, slide mapping, Q&A bank
  examples/
    input-marketing-strategy.json
    output-marketing-strategy-leadership.md
dist/real-estate-exec-brief.zip # upload-ready package
```

## Limits

- Not legal, tax, or formal valuation advice. Title questions go to a solicitor; formal valuations go to a registered estate surveyor and valuer.
- Compliance flags (ARCON, NDPA 2023, LASRERA) are prompts to check, not legal guidance. Confirm current rules before launch.
- Default thresholds (heat score, pricing bands, budget guardrail) are starting points. Calibrate them to your own deal history.

## Feedback and contributions

Used it on a real listing? [Open an issue](https://github.com/tobilobaadeyemo/claude-real-estate-exec-brief/issues/new) with what worked and what didn't, or send a pull request. If it saved you time, star the repo so others can find it.

Rebuild the zip after changes:
```bash
rm -f dist/real-estate-exec-brief.zip && zip -r dist/real-estate-exec-brief.zip real-estate-exec-brief
```

## License

MIT © 2026 Tobiloba Adeyemo
