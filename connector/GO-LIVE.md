# Go Live: charge in naira, get paid to your bank

About an hour of your time, plus Paystack's review. Nothing here needs code.

## How the money flows

```
User pays ₦ on Paystack (card, bank transfer, USSD)
  -> Paystack deducts its fee
  -> next working day (T+1), the rest lands in your Nigerian bank account
  -> spend or withdraw with that account's debit card
```

Paystack pays out to a **bank account**, not to a card. Use the account your debit card belongs to, and the money is on your card the day it settles.

Faster access later: once your business has had at least one payout a week for four weeks in a row, Paystack's **Payouts on Demand** lets you request part of your pending balance early (at the time of writing: up to 70%, for a 1% fee per withdrawal). Check the current terms in your dashboard.

## What you need

- A Nigerian bank account in your name, with your BVN
- A government ID
- A Render account (paid Starter instance plus a 1 GB disk; see render.com/pricing)
- About 15 minutes for a test purchase

## Step 1: Paystack account (30 minutes, then review)

1. Sign up at dashboard.paystack.com and choose **Nigeria**.
2. Pick **Starter Business** to begin without CAC registration. Submit your BVN and ID.
   - Starter Businesses can collect up to **₦8,000,000 in total**. Upgrade to a Registered Business (CAC) from the Compliance page before you get close.
3. Add your **payout account**: your personal bank account. For a Starter Business, the account name must match your BVN and ID.
4. Leave the payout schedule on the default (next working day).
5. **Leave "Pass fees to customers" (Settings > Preferences) off.** The fee table below assumes you absorb the fee. If you turn it on anyway, buyers are still credited correctly, but they pay more than the pack price.
6. Open **Settings > API Keys & Webhooks** and copy your **test secret key** (`sk_test_...`). The live key (`sk_live_...`) appears once Paystack activates the account.

## Step 2: Deploy the connector (10 minutes)

1. Click **Deploy to Render** in the repo README (or go to `https://render.com/deploy?repo=https://github.com/tobilobaadeyemo/claude-real-estate-exec-brief`).
2. Connect GitHub and approve the blueprint (`render.yaml`). It creates the web service, the disk, and the settings. Render deploys only after the repo's checks pass.
3. When asked for values:
   - `PAYSTACK_SECRET_KEY`: your `sk_test_...` key for now
   - `PUBLIC_BASE_URL`: leave empty to use the `onrender.com` address. For your own domain later, enter the full address, for example `https://brief.yourdomain.com`
   - `SUPPORT_EMAIL`: where buyers write if a payment needs a manual check. It is shown on the payment pages
4. When the deploy finishes, open `https://<your-service>.onrender.com/healthz`. You should see `{"ok":true}`.
5. Back in Paystack, set the **Test Webhook URL** to `https://<your-service>.onrender.com/paystack/webhook`.

**While you are on test keys, keep the service address to yourself.** Anyone could buy credits with Paystack's public test cards. Those credits are cancelled automatically when you switch to a live key (Step 4), but it is simpler not to share the link until then.

## Step 3: Test the full money path (15 minutes)

1. Open `https://<your-service>.onrender.com`, enter your email, and copy the connector URL.
2. In Claude: **Settings > Connectors > Add custom connector**, name it "Lagos Brief", and paste the URL.
3. In a chat, ask: "Build a marketing strategy for this listing" with listing details and comps. You get the free preview.
4. Ask again. You get a buy link. Open it, choose a pack, and pay with one of Paystack's test cards (Paystack docs, "Test Payments").
5. The return page confirms the credits added. Ask Claude again: you get the full strategy.
6. In the Paystack dashboard (test mode), the transaction shows in **NGN**.
7. Check the owner tools before real money depends on them. In Render, open your service > **Shell** and run `node /app/dist/src/admin.js status <your email>`. It should list your account and the test payment. If the Shell will not open, fix that now (Render's Shell docs), because held payments and lost URLs are fixed from there.
8. Check the proxy setting (it decides which visitor address the rate limits see). Do these two checks at least 10 seconds apart:
   - In your browser, open `https://<your-service>.onrender.com/?proxy_check=1`
   - In a computer terminal, run `curl -H "X-Forwarded-For: 1.2.3.4" "https://<your-service>.onrender.com/?proxy_check=1"`. On Windows PowerShell, type `curl.exe` instead of `curl` (or use Command Prompt).

   In Render, open **Logs** and find the two lines with `"event":"proxy_check"`:
   - First line: `client_ip` should be your own internet address (search "what is my IP" to compare). If it is anything else (for example a `10.x.x.x` address, or a Cloudflare address such as `172.6x.x.x` or `162.158.x.x`), raise `TRUST_PROXY` by 1.
   - Second line: `client_ip` must **not** be `1.2.3.4`. If it is, lower `TRUST_PROXY` by 1.
   - `TRUST_PROXY` is 3 on Render unless you set it. To change it, add `TRUST_PROXY` in your service's **Environment** page (it is deliberately not in `render.yaml`, so a later Blueprint sync does not undo your setting).
   - Repeat after any change until both checks pass, and again after any change to `render.yaml` or your domain setup.

## Step 4: Switch to live money

1. Once Paystack activates the account, copy the **live secret key**.
2. In Render: your service > **Environment** > set `PAYSTACK_SECRET_KEY` to `sk_live_...` and save. Render redeploys automatically. On the first start with a live key, credits bought with test payments are cancelled (the log shows `test_credits_voided`).
3. In Paystack, set the **Live Webhook URL** to the same `/paystack/webhook` address.
4. Buy the smallest pack with your own card. The next working day, check the payout in your bank account.

## Step 5 (optional): your own domain

1. Render: **Settings > Custom Domains**, add `brief.yourdomain.com`, and follow the DNS instructions.
2. Set `PUBLIC_BASE_URL=https://brief.yourdomain.com` in Render (with `https://`).
3. Update both Paystack webhook URLs to the new domain.

## What you receive per pack

Paystack local fee: 1.5% + ₦100, capped at ₦2,000. Foreign cards cost more and are not capped (at the time of writing: 3.9% + ₦100 for Visa, Mastercard, and Verve; 4.5% for American Express). Check Paystack's pricing page for current rates.

| Pack | Buyer pays | Paystack fee (local card) | You receive |
|---|---:|---:|---:|
| One strategy (3 credits) | ₦15,000 | ₦325 | ₦14,675 |
| Starter (10 credits) | ₦45,000 | ₦775 | ₦44,225 |
| Agency (40 credits) | ₦160,000 | ₦2,000 | ₦158,000 |

Your other running costs are Render hosting. The connector makes no AI calls, so serving a brief costs you nothing extra.

## When a payment needs attention

Payments that do not match a pack (wrong amount or currency, or a test payment on live keys) are **held for review**, never silently dropped. The buyer sees a "needs a manual check" page with your support email.

Refunds and chargebacks are handled automatically:
- **Refund** (from your Paystack dashboard): credits come off in proportion to the amount refunded, rounded in the buyer's favour. A full refund removes all of the pack's credits. Each refund counts once, even when Paystack resends the notice. A refund notice without an amount changes nothing and shows in `review`; check it in Paystack and run `reverse` if it was a full refund.
- **Chargeback opened**: the pack's remaining credits are held. If you win the dispute, they come back. If the buyer wins (including when the dispute is auto-accepted because nobody responded in time), they stay removed; if only part of the payment is refunded, the hold is lifted and credits come off in proportion to that part.

Abandoned checkouts (buyer opened Paystack and left) stay pending until you run `reconcile`, which closes them. A closed checkout still credits automatically if the buyer completes it later.

Owner tools run from Render's **Shell** tab (your service > Shell):

```bash
node /app/dist/src/admin.js review                         # held, disputed, and flagged payments; recent stuck checkouts
node /app/dist/src/admin.js reconcile                      # re-check pending checkouts with Paystack; closes abandoned ones
node /app/dist/src/admin.js settle <reference> --force     # credit a held payment after you have checked it
node /app/dist/src/admin.js grant <email> <credits> <reason>
node /app/dist/src/admin.js reverse <reference> <reason>   # remove a refunded payment's credits
node /app/dist/src/admin.js rotate <email>                 # new connector URL for a user who lost theirs
node /app/dist/src/admin.js status <email>
```

Every held, credited, reversed, or voided payment is also written to the Render log as a JSON line.

## Why it can only charge in naira

- Every Paystack checkout the server creates is sent with `currency: "NGN"` and the amount in kobo (`src/paystack.ts`). Currency is fixed in code; no setting can change it.
- Credits are granted only when Paystack confirms the payment **in NGN**, for **exactly** the pack price, with at least that amount charged. Anything else is held for review and logged (`src/store.ts`).
- Tests check these rules (`test/server.test.ts`, `test/hardening.test.ts`).
- Pack prices are set in kobo (`CREDIT_PACKS`, naira x 100). The defaults are ₦15,000, ₦45,000, and ₦160,000.

## Before you scale

- Upgrade to a Registered Business before ₦8M in total collections.
- Talk to an accountant about income tax and VAT on digital services, and to a lawyer about terms, refunds, and NDPA 2023 privacy.
