# Go Live: charge in naira, get paid to your bank

About an hour of your time, plus Paystack's review. Nothing here needs code.

## How the money flows

```
User pays ₦ on Paystack (card, bank transfer, USSD)
  -> Paystack deducts its fee
  -> next working day (T+1), the rest lands in your Nigerian bank account
  -> spend or withdraw with that account's debit card
```

Paystack pays out to a **bank account**, not to a card. Use the account your debit card belongs to, and the money is on your card the day it settles. For same-day access, turn on Paystack's Payouts on Demand.

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
4. Leave the payout schedule on the default (next working day), or enable **Payouts on Demand** for instant payouts.
5. Open **Settings > API Keys & Webhooks** and copy your **test secret key** (`sk_test_...`). The live key (`sk_live_...`) appears once Paystack activates the account.

## Step 2: Deploy the connector (10 minutes)

1. Click **Deploy to Render** in the repo README (or go to `https://render.com/deploy?repo=https://github.com/tobilobaadeyemo/claude-real-estate-exec-brief`).
2. Connect GitHub and approve the blueprint (`render.yaml`). It creates the web service, the disk, and the settings.
3. When asked for values:
   - `PAYSTACK_SECRET_KEY`: your `sk_test_...` key for now
   - `PUBLIC_BASE_URL`: leave empty to use the `onrender.com` address, or enter your custom domain later
   - `SUPPORT_EMAIL`: the address shown on the privacy page
4. When the deploy finishes, open `https://<your-service>.onrender.com/healthz`. You should see `{"ok":true}`.
5. Back in Paystack, set the **Test Webhook URL** to `https://<your-service>.onrender.com/paystack/webhook`.

## Step 3: Test the full money path (15 minutes)

1. Open `https://<your-service>.onrender.com`, enter your email, and copy the connector URL.
2. In Claude: **Settings > Connectors > Add custom connector**, name it "Lagos Brief", and paste the URL.
3. In a chat, ask: "Build a marketing strategy for this listing" with listing details and comps. You get the free preview.
4. Ask again. You get a buy link. Open it, choose a pack, and pay with one of Paystack's test cards (Paystack docs, "Test Payments").
5. The return page shows your new balance. Ask Claude again: you get the full strategy.
6. In the Paystack dashboard (test mode), the transaction shows in **NGN**.

## Step 4: Switch to live money

1. Once Paystack activates the account, copy the **live secret key**.
2. In Render: your service > **Environment** > set `PAYSTACK_SECRET_KEY` to `sk_live_...` and save. Render redeploys automatically.
3. In Paystack, set the **Live Webhook URL** to the same `/paystack/webhook` address.
4. Buy the smallest pack with your own card. The next working day, check the payout in your bank account.

## Step 5 (optional): your own domain

1. Render: **Settings > Custom Domains**, add `brief.yourdomain.com`, and follow the DNS instructions.
2. Set `PUBLIC_BASE_URL=https://brief.yourdomain.com` in Render.
3. Update both Paystack webhook URLs to the new domain.

## What you receive per pack

Paystack local fee: 1.5% + ₦100, capped at ₦2,000. Foreign cards cost 3.9%.

| Pack | Buyer pays | Paystack fee (local card) | You receive |
|---|---:|---:|---:|
| One strategy (3 credits) | ₦15,000 | ₦325 | ₦14,675 |
| Starter (10 credits) | ₦45,000 | ₦775 | ₦44,225 |
| Agency (40 credits) | ₦160,000 | ₦2,000 | ₦158,000 |

Your other running costs are Render hosting. The connector makes no AI calls, so serving a brief costs you nothing extra.

## Why it can only charge in naira

- Every Paystack checkout the server creates is sent with `currency: "NGN"` and the amount in kobo (`src/paystack.ts`). Currency is fixed in code; no setting can change it.
- Credits are granted only when Paystack confirms the payment **in NGN** and for **exactly** the pack amount; anything else is rejected and logged (`src/store.ts`).
- Tests check both rules (`test/server.test.ts`: "Paystack requests are always naira", "non-naira settlements are rejected").
- Pack prices are set in kobo (`CREDIT_PACKS`, naira x 100). The defaults are ₦15,000, ₦45,000, and ₦160,000.

## Before you scale

- Upgrade to a Registered Business before ₦8M in total collections.
- Talk to an accountant about income tax and VAT on digital services, and to a lawyer about terms, refunds, and NDPA 2023 privacy.
