import { createHmac, timingSafeEqual } from "node:crypto";

export interface InitializeParams {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, string | number>;
}

export interface VerifiedTransaction {
  status: string;
  /** Amount actually charged, in kobo (includes fees if fees are passed to the customer). */
  amount: number;
  /** Amount the checkout was created for, in kobo, when Paystack reports it. */
  requestedAmount?: number;
  currency: string;
  reference: string;
  /** "live" or "test": which Paystack mode processed the payment. */
  domain?: string;
}

export interface PaystackClient {
  initialize(params: InitializeParams): Promise<{ authorizationUrl: string }>;
  verify(reference: string): Promise<VerifiedTransaction>;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function createPaystackClient(secretKey: string, baseUrl = "https://api.paystack.co", fetchImpl: FetchLike = fetch): PaystackClient {
  const headers = { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" };

  async function call<T>(path: string, init: RequestInit): Promise<T> {
    if (!secretKey) throw new Error("PAYSTACK_SECRET_KEY is not configured");
    const res = await fetchImpl(`${baseUrl}${path}`, { ...init, headers, signal: AbortSignal.timeout(15_000) });
    const body = (await res.json()) as { status: boolean; message?: string; data?: T };
    if (!res.ok || !body.status || !body.data) throw new Error(`Paystack ${path.split("/").slice(0, 3).join("/")} failed: ${body.message ?? res.status}`);
    return body.data;
  }

  return {
    async initialize(p) {
      const data = await call<{ authorization_url: string }>("/transaction/initialize", {
        method: "POST",
        body: JSON.stringify({
          email: p.email,
          amount: p.amountKobo,
          currency: "NGN",
          reference: p.reference,
          callback_url: p.callbackUrl,
          metadata: p.metadata,
        }),
      });
      return { authorizationUrl: data.authorization_url };
    },
    async verify(reference) {
      const data = await call<{ status: string; amount: number; requested_amount?: number; currency: string; reference: string; domain?: string }>(
        `/transaction/verify/${encodeURIComponent(reference)}`,
        { method: "GET" },
      );
      return {
        status: data.status,
        amount: data.amount,
        requestedAmount: typeof data.requested_amount === "number" ? data.requested_amount : undefined,
        currency: data.currency,
        reference: data.reference,
        domain: data.domain,
      };
    },
  };
}

/** Paystack signs webhooks with HMAC-SHA512 of the raw body using the secret key. */
export function verifyWebhookSignature(rawBody: unknown, signature: string | undefined, secretKey: string): boolean {
  if (!Buffer.isBuffer(rawBody) || !signature || !secretKey) return false;
  const expected = createHmac("sha512", secretKey).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
