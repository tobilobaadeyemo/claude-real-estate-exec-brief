import Database from "better-sqlite3";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { KeyMode, Pack } from "./config.js";
import type { VerifiedTransaction } from "./paystack.js";

export interface Account {
  id: string;
  email: string;
  credits: number;
  preview_used: number;
  created_at: string;
}

export interface StoredPlan {
  id: string;
  account_id: string;
  kind: "marketing_strategy";
  listing_id: string | null;
  input_json: string;
  input_hash: string | null;
  created_at: string;
}

/**
 * pending: checkout started. paid: credited. review: Paystack reported a payment that did not match
 * the pack (held for the owner, never terminal). reversed: refunded or charged back. voided: a test-mode
 * payment cancelled when the service switched to live keys.
 */
export type PaymentStatus = "pending" | "paid" | "review" | "reversed" | "voided";

export interface Payment {
  reference: string;
  account_id: string;
  pack_id: string;
  credits: number;
  amount_kobo: number;
  status: PaymentStatus;
  mode: string | null;
  paid_amount: number | null;
  review_reason: string | null;
  last_verified_at: string | null;
  created_at: string;
  paid_at: string | null;
}

export type SettleResult = "credited" | "already" | "review" | "unknown";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
  preview_used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS accounts_email ON accounts(email);
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS checkouts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS checkouts_account ON checkouts(account_id, expires_at);
CREATE TABLE IF NOT EXISTS payments (
  reference TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  pack_id TEXT NOT NULL,
  credits INTEGER NOT NULL,
  amount_kobo INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  paid_at TEXT
);
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  kind TEXT NOT NULL,
  listing_id TEXT,
  input_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS plans_account ON plans(account_id);
`;

/** Columns added after the first release; applied idempotently on startup. */
const MIGRATIONS: [table: string, column: string, ddl: string][] = [
  ["payments", "mode", "ALTER TABLE payments ADD COLUMN mode TEXT"],
  ["payments", "paid_amount", "ALTER TABLE payments ADD COLUMN paid_amount INTEGER"],
  ["payments", "review_reason", "ALTER TABLE payments ADD COLUMN review_reason TEXT"],
  ["payments", "last_verified_at", "ALTER TABLE payments ADD COLUMN last_verified_at TEXT"],
  ["plans", "input_hash", "ALTER TABLE plans ADD COLUMN input_hash TEXT"],
];

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function id(prefix: string, bytes = 12): string {
  return `${prefix}_${randomBytes(bytes).toString("base64url")}`;
}

function log(event: string, details: Record<string, unknown>): void {
  console.error(JSON.stringify({ event, ...details, at: new Date().toISOString() }));
}

export class Store {
  readonly db: Database.Database;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    // FULL: a settlement acknowledged to Paystack must survive a host crash.
    this.db.pragma("synchronous = FULL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(SCHEMA);
    for (const [table, column, ddl] of MIGRATIONS) {
      const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      if (!cols.some((c) => c.name === column)) this.db.exec(ddl);
    }
    this.db.exec("CREATE INDEX IF NOT EXISTS plans_hash ON plans(account_id, input_hash)");
    this.db.exec("CREATE INDEX IF NOT EXISTS payments_status ON payments(status, created_at)");
  }

  private now(): string {
    return new Date().toISOString();
  }

  /** Creates an account and returns the secret token once; only its hash is stored. */
  createAccount(email: string): { account: Account; token: string } {
    const token = randomBytes(32).toString("base64url");
    const account: Account = { id: id("acc"), email, credits: 0, preview_used: 0, created_at: this.now() };
    this.db
      .prepare("INSERT INTO accounts (id, email, token_hash, credits, preview_used, created_at) VALUES (?, ?, ?, 0, 0, ?)")
      .run(account.id, email, hashToken(token), account.created_at);
    return { account, token };
  }

  findByToken(token: string): Account | undefined {
    if (!token) return undefined;
    return this.db.prepare("SELECT id, email, credits, preview_used, created_at FROM accounts WHERE token_hash = ?").get(hashToken(token)) as Account | undefined;
  }

  getAccount(accountId: string): Account | undefined {
    return this.db.prepare("SELECT id, email, credits, preview_used, created_at FROM accounts WHERE id = ?").get(accountId) as Account | undefined;
  }

  /** Accounts by id or email, for the admin CLI. */
  findAccounts(idOrEmail: string): Account[] {
    return this.db
      .prepare("SELECT id, email, credits, preview_used, created_at FROM accounts WHERE id = ? OR email = ? ORDER BY created_at")
      .all(idOrEmail, idOrEmail.toLowerCase()) as Account[];
  }

  /** Replaces the account's token; the old connector URL stops working immediately. */
  rotateToken(accountId: string): string {
    const token = randomBytes(32).toString("base64url");
    const result = this.db.prepare("UPDATE accounts SET token_hash = ? WHERE id = ?").run(hashToken(token), accountId);
    if (result.changes !== 1) throw new Error(`Unknown account ${accountId}`);
    log("token_rotated", { account: accountId });
    return token;
  }

  /** Atomically deducts credits; returns false without side effects when the balance is too low. */
  charge(accountId: string, cost: number, reason: string, ref?: string): boolean {
    return this.db.transaction(() => {
      const result = this.db.prepare("UPDATE accounts SET credits = credits - ? WHERE id = ? AND credits >= ?").run(cost, accountId, cost);
      if (result.changes !== 1) return false;
      this.db.prepare("INSERT INTO ledger (account_id, delta, reason, ref, created_at) VALUES (?, ?, ?, ?, ?)").run(accountId, -cost, reason, ref ?? null, this.now());
      return true;
    })();
  }

  grant(accountId: string, credits: number, reason: string, ref?: string): void {
    this.db.transaction(() => {
      const result = this.db.prepare("UPDATE accounts SET credits = credits + ? WHERE id = ?").run(credits, accountId);
      if (result.changes !== 1) throw new Error(`Unknown account ${accountId}`);
      this.db.prepare("INSERT INTO ledger (account_id, delta, reason, ref, created_at) VALUES (?, ?, ?, ?, ?)").run(accountId, credits, reason, ref ?? null, this.now());
    })();
  }

  /** Removes up to `credits` from the balance (never below zero); returns how many were removed. */
  private debitUpTo(accountId: string, credits: number, reason: string, ref: string): number {
    const account = this.getAccount(accountId);
    const removed = Math.min(account?.credits ?? 0, credits);
    if (removed > 0) {
      this.db.prepare("UPDATE accounts SET credits = credits - ? WHERE id = ?").run(removed, accountId);
      this.db.prepare("INSERT INTO ledger (account_id, delta, reason, ref, created_at) VALUES (?, ?, ?, ?, ?)").run(accountId, -removed, reason, ref, this.now());
    }
    return removed;
  }

  /**
   * Claims the one free preview. It is per account and per email address, so signing up again
   * with the same email does not unlock another preview.
   */
  claimPreview(accountId: string): boolean {
    return this.db.transaction(() => {
      const account = this.getAccount(accountId);
      if (!account || account.preview_used) return false;
      const other = this.db.prepare("SELECT 1 FROM accounts WHERE email = ? AND preview_used = 1 AND id != ? LIMIT 1").get(account.email, accountId);
      this.db.prepare("UPDATE accounts SET preview_used = 1 WHERE id = ?").run(accountId);
      return !other;
    })();
  }

  previewAvailable(accountId: string): boolean {
    const account = this.getAccount(accountId);
    if (!account || account.preview_used) return false;
    return !this.db.prepare("SELECT 1 FROM accounts WHERE email = ? AND preview_used = 1 AND id != ? LIMIT 1").get(account.email, accountId);
  }

  /** Returns the account's live checkout link id, creating one only when none has 1 hour or more left. */
  getOrCreateCheckout(accountId: string, ttlHours = 24): string {
    const now = new Date();
    const minExpiry = new Date(now.getTime() + 3_600_000).toISOString();
    const existing = this.db
      .prepare("SELECT id FROM checkouts WHERE account_id = ? AND expires_at > ? ORDER BY expires_at DESC LIMIT 1")
      .get(accountId, minExpiry) as { id: string } | undefined;
    if (existing) return existing.id;
    const checkoutId = id("chk", 16);
    this.db
      .prepare("INSERT INTO checkouts (id, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .run(checkoutId, accountId, now.toISOString(), new Date(now.getTime() + ttlHours * 3_600_000).toISOString());
    return checkoutId;
  }

  getCheckout(checkoutId: string): { id: string; account_id: string; expires_at: string } | undefined {
    const row = this.db.prepare("SELECT id, account_id, expires_at FROM checkouts WHERE id = ?").get(checkoutId) as
      | { id: string; account_id: string; expires_at: string }
      | undefined;
    if (!row || row.expires_at < this.now()) return undefined;
    return row;
  }

  /** Deletes expired checkout links. */
  purgeExpired(): number {
    return this.db.prepare("DELETE FROM checkouts WHERE expires_at < ?").run(this.now()).changes;
  }

  createPayment(accountId: string, pack: Pack, mode: KeyMode): Payment {
    const payment: Payment = {
      reference: id("pay", 12),
      account_id: accountId,
      pack_id: pack.id,
      credits: pack.credits,
      amount_kobo: pack.price_kobo,
      status: "pending",
      mode,
      paid_amount: null,
      review_reason: null,
      last_verified_at: null,
      created_at: this.now(),
      paid_at: null,
    };
    this.db
      .prepare("INSERT INTO payments (reference, account_id, pack_id, credits, amount_kobo, status, mode, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)")
      .run(payment.reference, accountId, pack.id, pack.credits, pack.price_kobo, mode, payment.created_at);
    return payment;
  }

  getPayment(reference: string): Payment | undefined {
    return this.db.prepare("SELECT * FROM payments WHERE reference = ?").get(reference) as Payment | undefined;
  }

  listPayments(statuses: PaymentStatus[], olderThanMinutes = 0): Payment[] {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();
    const marks = statuses.map(() => "?").join(", ");
    return this.db
      .prepare(`SELECT * FROM payments WHERE status IN (${marks}) AND created_at <= ? ORDER BY created_at`)
      .all(...statuses, cutoff) as Payment[];
  }

  /** True when the payment has not been verified with Paystack in the last `intervalMs`. Records the attempt. */
  claimVerifySlot(reference: string, intervalMs = 30_000): boolean {
    const cutoff = new Date(Date.now() - intervalMs).toISOString();
    const result = this.db
      .prepare("UPDATE payments SET last_verified_at = ? WHERE reference = ? AND (last_verified_at IS NULL OR last_verified_at < ?)")
      .run(this.now(), reference, cutoff);
    return result.changes === 1;
  }

  /**
   * Settles a payment Paystack reports as successful, granting its credits exactly once.
   * Credits are granted when the currency is NGN, the checkout was for exactly the pack price,
   * and at least that much was charged (fees passed to the customer are fine). Anything else,
   * including a test-mode payment while running on live keys, is held for review, logged,
   * and can be settled later by the owner. Review is never terminal.
   */
  settlePayment(reference: string, tx: Pick<VerifiedTransaction, "amount" | "requestedAmount" | "currency" | "domain">, keyMode: KeyMode, force = false): SettleResult {
    return this.db.transaction((): SettleResult => {
      const payment = this.getPayment(reference);
      if (!payment) {
        log("settle_unknown_reference", { reference });
        return "unknown";
      }
      if (payment.status === "paid" || payment.status === "reversed" || payment.status === "voided") return "already";
      const requested = tx.requestedAmount ?? tx.amount;
      const problems: string[] = [];
      if (tx.currency !== "NGN") problems.push(`currency ${tx.currency}`);
      if (requested !== payment.amount_kobo) problems.push(`requested ${requested} kobo, pack is ${payment.amount_kobo}`);
      if (tx.amount < payment.amount_kobo) problems.push(`charged ${tx.amount} kobo, below the pack price`);
      if (keyMode === "live" && tx.domain === "test") problems.push("test-mode payment while running on live keys");
      if (problems.length && !force) {
        const reason = problems.join("; ");
        this.db.prepare("UPDATE payments SET status = 'review', review_reason = ? WHERE reference = ?").run(reason, reference);
        log("payment_held_for_review", { reference, account: payment.account_id, reason, charged: tx.amount, currency: tx.currency });
        return "review";
      }
      const updated = this.db
        .prepare("UPDATE payments SET status = 'paid', paid_at = ?, paid_amount = ?, mode = COALESCE(?, mode), review_reason = NULL WHERE reference = ? AND status IN ('pending', 'review')")
        .run(this.now(), tx.amount, tx.domain ?? null, reference);
      if (updated.changes !== 1) return "already";
      this.grant(payment.account_id, payment.credits, `purchase:${payment.pack_id}${force ? ":manual" : ""}`, reference);
      log("payment_credited", { reference, account: payment.account_id, credits: payment.credits, charged: tx.amount, forced: force });
      return "credited";
    })();
  }

  /** Refund or chargeback: marks the payment reversed and removes its credits (as many as remain). */
  reversePayment(reference: string, reason: string): { status: "reversed" | "already" | "unknown" | "not_paid"; removed: number; shortfall: number } {
    return this.db.transaction(() => {
      const payment = this.getPayment(reference);
      if (!payment) return { status: "unknown" as const, removed: 0, shortfall: 0 };
      if (payment.status === "reversed") return { status: "already" as const, removed: 0, shortfall: 0 };
      if (payment.status !== "paid") {
        this.db.prepare("UPDATE payments SET status = 'reversed', review_reason = ? WHERE reference = ?").run(reason, reference);
        return { status: "not_paid" as const, removed: 0, shortfall: 0 };
      }
      const removed = this.debitUpTo(payment.account_id, payment.credits, `reversal:${reason}`, reference);
      this.db.prepare("UPDATE payments SET status = 'reversed', review_reason = ? WHERE reference = ?").run(reason, reference);
      const shortfall = payment.credits - removed;
      log("payment_reversed", { reference, account: payment.account_id, reason, removed, shortfall });
      return { status: "reversed" as const, removed, shortfall };
    })();
  }

  /** On live keys: cancel credits that came from test-mode payments. Returns how many payments were voided. */
  voidTestCredits(): number {
    return this.db.transaction(() => {
      const rows = this.db.prepare("SELECT * FROM payments WHERE status = 'paid' AND mode = 'test'").all() as Payment[];
      for (const p of rows) {
        const removed = this.debitUpTo(p.account_id, p.credits, "void:test-mode", p.reference);
        this.db.prepare("UPDATE payments SET status = 'voided' WHERE reference = ?").run(p.reference);
        log("test_payment_voided", { reference: p.reference, account: p.account_id, removed });
      }
      return rows.length;
    })();
  }

  savePlan(accountId: string, listingId: string, input: unknown, inputHash: string): string {
    const planId = id("pln", 9);
    this.db
      .prepare("INSERT INTO plans (id, account_id, kind, listing_id, input_json, input_hash, created_at) VALUES (?, ?, 'marketing_strategy', ?, ?, ?, ?)")
      .run(planId, accountId, listingId, JSON.stringify(input), inputHash, this.now());
    return planId;
  }

  /** A paid plan for the same inputs in the last `days` days, so re-running a listing is free. */
  findRecentPlan(accountId: string, inputHash: string, days = 30): StoredPlan | undefined {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    return this.db
      .prepare("SELECT * FROM plans WHERE account_id = ? AND input_hash = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 1")
      .get(accountId, inputHash, since) as StoredPlan | undefined;
  }

  getPlan(accountId: string, planId: string): StoredPlan | undefined {
    return this.db.prepare("SELECT * FROM plans WHERE id = ? AND account_id = ?").get(planId, accountId) as StoredPlan | undefined;
  }

  deletePlans(accountId: string): number {
    return this.db.prepare("DELETE FROM plans WHERE account_id = ?").run(accountId).changes;
  }

  close(): void {
    this.db.close();
  }
}
