import type { Config, Pack } from "./config.js";
import { COSTS } from "./config.js";

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function naira(pack: Pack): string {
  return `₦${(pack.price_kobo / 100).toLocaleString("en-US")}`;
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>
:root { --bg: #fbfaf7; --fg: #1d1d1b; --muted: #5f5e58; --line: #e3e0d8; --accent: #0f5c4a; --card: #ffffff; }
@media (prefers-color-scheme: dark) { :root { --bg: #161614; --fg: #ecebe6; --muted: #a8a69e; --line: #34332f; --accent: #5ec2a4; --card: #1f1f1c; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 760px; margin: 0 auto; padding: 32px 16px 64px; }
h1 { font-size: 1.9rem; line-height: 1.2; margin: 0 0 8px; }
h2 { font-size: 1.15rem; margin: 32px 0 8px; }
p, li { color: var(--fg); }
.muted { color: var(--muted); }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 16px; margin: 12px 0; }
.packs { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
button, .button { display: inline-block; background: var(--accent); color: #fff; border: 0; border-radius: 8px; padding: 10px 16px; font: inherit; font-weight: 600; cursor: pointer; text-decoration: none; }
input[type=email] { width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 8px; font: inherit; background: var(--card); color: var(--fg); }
code, .url { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9rem; word-break: break-all; }
.url { display: block; padding: 12px; border: 1px dashed var(--accent); border-radius: 8px; background: var(--card); }
table { border-collapse: collapse; width: 100%; } td, th { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

export function landingPage(config: Config): string {
  const packs = config.packs
    .map((p) => `<div class="card"><strong>${escape(p.name)}</strong><br>${p.credits} credits<br><span class="muted">${naira(p)}</span></div>`)
    .join("");
  return page(
    "Lagos Brief Connector",
    `<h1>Lagos listing strategy, inside Claude</h1>
<p class="muted">A Claude connector that turns a listing and your deal data into a presentation-ready marketing strategy: price position, list price, buyer targeting, channel plan, budget, funnel targets, review gates, and presenter notes. Every number is computed, not guessed.</p>
<h2>How it works</h2>
<ol>
<li>Get your personal connector URL below.</li>
<li>In Claude, open <strong>Settings &gt; Connectors &gt; Add custom connector</strong> and paste the URL (paid Claude plans).</li>
<li>Ask Claude: "Build a marketing strategy for our Lekki listing" and attach your comps and CRM export.</li>
<li>Your first run is a free preview (the market diagnosis). Buy credits to unlock full strategies.</li>
</ol>
<h2>Pricing</h2>
<p class="muted">Pay per call with credits. Full strategy: ${COSTS.marketing_strategy} credits (leadership, client, and team versions included). Market brief: ${COSTS.market_brief}. Weekly campaign update: ${COSTS.campaign_update}. Paid in naira through Paystack: card, bank transfer, or USSD.</p>
<div class="packs">${packs}</div>
<h2>Get your connector URL</h2>
<form method="post" action="/signup" class="card">
<label for="email">Work email (used for receipts)</label>
<input id="email" name="email" type="email" required maxlength="200" autocomplete="email">
<p><button type="submit">Create my connector</button></p>
</form>
<p class="muted">Free, open methodology: <a href="https://github.com/tobilobaadeyemo/claude-real-estate-exec-brief">github.com/tobilobaadeyemo/claude-real-estate-exec-brief</a> · <a href="/privacy">Privacy</a></p>`,
  );
}

export function connectorCreatedPage(url: string, supportEmail?: string): string {
  return page(
    "Your connector URL",
    `<h1>Your connector is ready</h1>
<p>Copy this URL now. It is shown once and works like a password: anyone with it can spend your credits.</p>
<span class="url">${escape(url)}</span>
<h2>Add it to Claude</h2>
<ol>
<li>Open Claude, then <strong>Settings &gt; Connectors &gt; Add custom connector</strong>.</li>
<li>Name it "Lagos Brief" and paste the URL.</li>
<li>In a chat, enable the connector and ask for a marketing strategy. Your first run is a free preview.</li>
</ol>
<p class="muted">If the URL leaks, ask Claude to run <code>rotate_connector_url</code> to replace it. Lost it completely? ${supportEmail ? `Email ${escape(supportEmail)} to move your credits to a new URL.` : "Contact support to move your credits to a new URL."}</p>`,
  );
}

export function buyPage(checkoutId: string, config: Config): string {
  const options = config.packs
    .map(
      (p, i) =>
        `<label class="card" style="display:block;cursor:pointer"><input type="radio" name="pack" value="${escape(p.id)}" ${i === 0 ? "checked" : ""}> <strong>${escape(p.name)}</strong>: ${p.credits} credits for ${naira(p)}</label>`,
    )
    .join("");
  return page(
    "Buy credits",
    `<h1>Buy credits</h1>
<p class="muted">Full strategy ${COSTS.marketing_strategy} credits · market brief ${COSTS.market_brief} · campaign update ${COSTS.campaign_update}. Secure payment by Paystack.</p>
<form method="post" action="/buy/${escape(checkoutId)}">${options}<p><button type="submit">Pay with Paystack</button></p></form>`,
  );
}

export function messagePage(title: string, message: string): string {
  return page(title, `<h1>${escape(title)}</h1><p>${escape(message)}</p>`);
}

export function privacyPage(config: Config): string {
  return page(
    "Privacy",
    `<h1>Privacy</h1>
<p>We store: your email (for receipts), a hash of your connector token, your credit balance and ledger, payment references, and the listing inputs of strategies you pay for (so audience versions and campaign updates work).</p>
<p>We do not ask for client names, phone numbers, or addresses. Comparable descriptions should contain type and size only.</p>
<p>Delete your saved plans at any time with the <code>delete_my_data</code> tool in Claude. Card details are handled by Paystack and never reach this service.</p>
<p>Server logs record payment references and, when a proxy check is requested (a page opened with ?proxy_check=1, at most once every 10 seconds), the requesting IP address and forwarding chain, to verify the hosting setup. They never record connector URLs on our side.</p>
<p>We process data under the Nigeria Data Protection Act 2023.${config.supportEmail ? ` Requests: ${escape(config.supportEmail)}.` : ""}</p>`,
  );
}
