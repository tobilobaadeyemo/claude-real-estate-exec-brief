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

/** Smallest pack price accepted (₦100), well above Paystack's NGN minimum. */
const MIN_PRICE_KOBO = 100_00;

export type KeyMode = "live" | "test" | "none";

export interface Config {
  port: number;
  baseUrl: string;
  databasePath: string;
  paystackSecretKey: string;
  paystackBaseUrl: string;
  keyMode: KeyMode;
  packs: Pack[];
  supportEmail?: string;
  /** Number of reverse-proxy hops to trust for the client IP (0 = none). */
  trustProxy: number;
}

const SECRET_KEY = /^sk_(live|test)_[A-Za-z0-9]+$/;

function parsePacks(raw: string | undefined): Pack[] {
  if (!raw) return DEFAULT_PACKS;
  let packs: Pack[];
  try {
    packs = JSON.parse(raw) as Pack[];
  } catch {
    throw new Error("CREDIT_PACKS is not valid JSON");
  }
  if (!Array.isArray(packs) || packs.length === 0) throw new Error("CREDIT_PACKS must be a non-empty JSON array");
  const ids = new Set<string>();
  for (const p of packs) {
    const valid =
      typeof p.id === "string" && /^[a-z0-9_-]{1,32}$/.test(p.id) &&
      typeof p.name === "string" && p.name.trim().length > 0 && p.name.length <= 60 &&
      Number.isInteger(p.credits) && p.credits > 0 &&
      Number.isInteger(p.price_kobo) && p.price_kobo >= MIN_PRICE_KOBO;
    if (!valid) throw new Error(`Invalid credit pack ${JSON.stringify(p)}: needs id (a-z, 0-9, _ or -), name, whole credits > 0, and price_kobo >= ${MIN_PRICE_KOBO}`);
    if (ids.has(p.id)) throw new Error(`Duplicate credit pack id ${p.id}`);
    ids.add(p.id);
  }
  return packs;
}

function parseTrustProxy(raw: string | undefined): number {
  if (!raw || raw === "0" || raw === "false") return 0;
  if (raw === "true") return 1;
  const hops = Number(raw);
  if (!Number.isInteger(hops) || hops < 0 || hops > 10) throw new Error("TRUST_PROXY must be a whole number of proxy hops (0 to 10)");
  return hops;
}

function parseBaseUrl(raw: string, production: boolean): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`PUBLIC_BASE_URL must be a full URL such as https://brief.example.com (got "${raw}")`);
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (production && url.protocol !== "https:" && !local) throw new Error("PUBLIC_BASE_URL must use https:// in production");
  return url.origin;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 3000);
  const production = env.NODE_ENV === "production";
  const secret = env.PAYSTACK_SECRET_KEY ?? "";
  if (secret && !SECRET_KEY.test(secret)) throw new Error("PAYSTACK_SECRET_KEY must be a Paystack secret key (sk_live_... or sk_test_...)");
  if (production && !secret) throw new Error("PAYSTACK_SECRET_KEY is required in production");
  const keyMode: KeyMode = secret.startsWith("sk_live_") ? "live" : secret ? "test" : "none";
  if (production && keyMode === "test") console.warn("Paystack TEST key in use: payments are simulated and no naira will settle. Credits from test payments are voided when a live key is set.");
  const rawBase = env.PUBLIC_BASE_URL || env.RENDER_EXTERNAL_URL || (production ? "" : `http://localhost:${port}`);
  if (!rawBase) throw new Error("PUBLIC_BASE_URL is required in production (for example https://brief.example.com)");
  return {
    port,
    // Render sets RENDER_EXTERNAL_URL; a custom domain should set PUBLIC_BASE_URL.
    baseUrl: parseBaseUrl(rawBase, production),
    databasePath: env.DATABASE_PATH ?? "./data/connector.db",
    paystackSecretKey: secret,
    paystackBaseUrl: env.PAYSTACK_BASE_URL ?? "https://api.paystack.co",
    keyMode,
    packs: parsePacks(env.CREDIT_PACKS),
    supportEmail: env.SUPPORT_EMAIL || undefined,
    // Render (which sets RENDER=true) sits 3 hops in front of the app; TRUST_PROXY overrides it.
    trustProxy: parseTrustProxy(env.TRUST_PROXY ?? (env.RENDER === "true" ? "3" : undefined)),
  };
}
