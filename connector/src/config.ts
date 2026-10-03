export interface Pack {
  id: string;
  name: string;
  credits: number;
  /** Price in kobo (NGN x 100), as Paystack expects. */
  price_kobo: number;
}

/** Credits charged per paid tool call. */
export const COSTS = {
  marketing_strategy: 3,
  market_brief: 2,
  campaign_update: 1,
} as const;

export const DEFAULT_PACKS: Pack[] = [
  { id: "single", name: "One strategy", credits: 3, price_kobo: 15_000_00 },
  { id: "starter", name: "Starter", credits: 10, price_kobo: 45_000_00 },
  { id: "agency", name: "Agency", credits: 40, price_kobo: 160_000_00 },
];

export interface Config {
  port: number;
  baseUrl: string;
  databasePath: string;
  paystackSecretKey: string;
  paystackBaseUrl: string;
  packs: Pack[];
  supportEmail?: string;
  trustProxy: boolean;
}

const SECRET_KEY = /^sk_(live|test)_[A-Za-z0-9]+$/;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 3000);
  const production = env.NODE_ENV === "production";
  const secret = env.PAYSTACK_SECRET_KEY ?? "";
  if (secret && !SECRET_KEY.test(secret)) throw new Error("PAYSTACK_SECRET_KEY must be a Paystack secret key (sk_live_... or sk_test_...)");
  if (production && !secret) throw new Error("PAYSTACK_SECRET_KEY is required in production");
  if (production && secret.startsWith("sk_test_")) console.warn("Paystack TEST key in use: payments are simulated and no naira will settle.");
  const packs = env.CREDIT_PACKS ? (JSON.parse(env.CREDIT_PACKS) as Pack[]) : DEFAULT_PACKS;
  for (const p of packs) {
    if (!p.id || !Number.isInteger(p.credits) || p.credits <= 0 || !Number.isInteger(p.price_kobo) || p.price_kobo <= 0) {
      throw new Error(`Invalid credit pack ${JSON.stringify(p)}`);
    }
  }
  return {
    port,
    // Render sets RENDER_EXTERNAL_URL; a custom domain should set PUBLIC_BASE_URL.
    baseUrl: (env.PUBLIC_BASE_URL || env.RENDER_EXTERNAL_URL || `http://localhost:${port}`).replace(/\/$/, ""),
    databasePath: env.DATABASE_PATH ?? "./data/connector.db",
    paystackSecretKey: secret,
    paystackBaseUrl: env.PAYSTACK_BASE_URL ?? "https://api.paystack.co",
    packs,
    supportEmail: env.SUPPORT_EMAIL,
    trustProxy: env.TRUST_PROXY === "1",
  };
}
