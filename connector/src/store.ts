import Database from "better-sqlite3";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Pack } from "./config.js";

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
  created_at: string;
}

export interface Payment {
  reference: string;
  account_id: string;
  pack_id: string;
  credits: number;
  amount_kobo: number;
  status: "pending" | "paid" | "rejected";
  created_at: string;
  paid_at: string | null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
  preview_used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
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

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function id(prefix: string, bytes = 12): string {
  return `${prefix}_${randomBytes(bytes).toString("base64url")}`;
}

export class Store {
  readonly db: Database.Database;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(SCHEMA);
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
    return this.db.prepare("SELECT id, email, credits, preview_used, created_at FROM accounts WHERE token_hash = ?").get(hashToken(token)) as Account | undefined;
  }

  getAccount(accountId: string): Account | undefined {
    return this.db.prepare("SELECT id, email, credits, preview_used, created_at FROM accounts WHERE id = ?").get(accountId) as Account | undefined;
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
      this.db.prepare("UPDATE accounts SET credits = credits + ? WHERE id = ?").run(credits, accountId);
      this.db.prepare("INSERT INTO ledger (account_id, delta, reason, ref, created_at) VALUES (?, ?, ?, ?, ?)").run(accountId, credits, reason, ref ?? null, this.now());
    })();
  }

  /** Claims the one free preview; true only the first time. */
  claimPreview(accountId: string): boolean {
    return this.db.prepare("UPDATE accounts SET preview_used = 1 WHERE id = ? AND preview_used = 0").run(accountId).changes === 1;
  }

  createCheckout(accountId: string, ttlHours = 24): string {
    const checkoutId = id("chk", 16);
    const now = new Date();
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

  createPayment(accountId: string, pack: Pack): Payment {
    const payment: Payment = {
      reference: id("pay", 12),
      account_id: accountId,
      pack_id: pack.id,
      credits: pack.credits,
      amount_kobo: pack.price_kobo,
      status: "pending",
      created_at: this.now(),
      paid_at: null,
    };
    this.db
      .prepare("INSERT INTO payments (reference, account_id, pack_id, credits, amount_kobo, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)")
      .run(payment.reference, accountId, pack.id, pack.credits, pack.price_kobo, payment.created_at);
    return payment;
  }

  getPayment(reference: string): Payment | undefined {
    return this.db.prepare("SELECT * FROM payments WHERE reference = ?").get(reference) as Payment | undefined;
  }

  /**
   * Marks a verified payment as paid and grants its credits exactly once.
   * Returns "credited" the first time, "already" on repeats, "rejected" on mismatch.
   */
  settlePayment(reference: string, amountKobo: number, currency: string): "credited" | "already" | "rejected" | "unknown" {
    return this.db.transaction(() => {
      const payment = this.getPayment(reference);
      if (!payment) return "unknown";
      if (payment.status === "paid") return "already";
      if (payment.status !== "pending") return "rejected";
      if (currency !== "NGN" || amountKobo !== payment.amount_kobo) {
        this.db.prepare("UPDATE payments SET status = 'rejected' WHERE reference = ?").run(reference);
        return "rejected";
      }
      const updated = this.db.prepare("UPDATE payments SET status = 'paid', paid_at = ? WHERE reference = ? AND status = 'pending'").run(this.now(), reference);
      if (updated.changes !== 1) return "already";
      this.grant(payment.account_id, payment.credits, `purchase:${payment.pack_id}`, reference);
      return "credited";
    })();
  }

  savePlan(accountId: string, listingId: string, input: unknown): string {
    const planId = id("pln", 9);
    this.db
      .prepare("INSERT INTO plans (id, account_id, kind, listing_id, input_json, created_at) VALUES (?, ?, 'marketing_strategy', ?, ?, ?)")
      .run(planId, accountId, listingId, JSON.stringify(input), this.now());
    return planId;
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
