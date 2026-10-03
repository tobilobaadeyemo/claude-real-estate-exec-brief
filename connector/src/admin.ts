/**
 * Owner tools, run from the host's shell (Render: your service > Shell):
 *
 *   node /app/dist/src/admin.js status <email|account-id>
 *   node /app/dist/src/admin.js review                       held, disputed, and flagged payments; checkouts pending 30 minutes to 48 hours
 *   node /app/dist/src/admin.js reconcile                    re-check pending checkouts older than 10 minutes with Paystack; closes abandoned ones
 *   node /app/dist/src/admin.js settle <reference> [--force] re-check one payment; --force credits it after you have checked it yourself
 *   node /app/dist/src/admin.js grant <email|account-id> <credits> <reason>
 *   node /app/dist/src/admin.js reverse <reference> <reason> remove a refunded payment's credits
 *   node /app/dist/src/admin.js rotate <email|account-id>    issue a new connector URL and disable the old one
 */
import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.js";
import { Store, type Account } from "./store.js";
import { createPaystackClient, PaystackError } from "./paystack.js";
import { dropPrivileges } from "./server.js";

function one(store: Store, who: string): Account {
  const found = store.findAccounts(who);
  if (found.length === 0) throw new Error(`No account matches ${who}`);
  if (found.length > 1) {
    throw new Error(`${found.length} accounts use ${who}; pass an account id instead:\n${found.map((a) => `  ${a.id}  credits=${a.credits}  created=${a.created_at}`).join("\n")}`);
  }
  return found[0];
}

export async function runAdmin(argv: string[], out: (line: string) => void = console.log): Promise<void> {
  const [command, ...args] = argv;
  const config = loadConfig();
  dropPrivileges(config.databasePath);
  const store = new Store(config.databasePath);
  const paystack = createPaystackClient(config.paystackSecretKey, config.paystackBaseUrl);
  try {
    switch (command) {
      case "status": {
        for (const a of store.findAccounts(args[0] ?? "")) {
          out(`${a.id}  ${a.email}  credits=${a.credits}  preview_used=${a.preview_used}  created=${a.created_at}`);
          const rows = store.db.prepare("SELECT reference, pack_id, status, amount_kobo, paid_amount, review_reason, created_at FROM payments WHERE account_id = ? ORDER BY created_at").all(a.id);
          for (const p of rows) out(`  payment ${JSON.stringify(p)}`);
        }
        break;
      }
      case "review": {
        const rows = [...store.listPayments(["review", "disputed"]), ...store.flaggedPaidPayments(), ...store.listPayments(["pending"], 30, 48 * 60)];
        for (const p of rows) {
          out(`${p.reference}  ${p.status}  account=${p.account_id}  pack=${p.pack_id}  price=${p.amount_kobo / 100} NGN  reason=${p.review_reason ?? "-"}  created=${p.created_at}`);
        }
        const older = store.listPayments(["pending"], 48 * 60).length;
        if (older > 0) out(`${older} checkout(s) pending for over 48 hours are not listed; run reconcile to close the abandoned ones.`);
        if (rows.length === 0 && older === 0) out("Nothing needs attention.");
        break;
      }
      case "reconcile": {
        for (const p of store.listPayments(["pending"], 10)) {
          try {
            const tx = await paystack.verify(p.reference);
            let result: string;
            if (tx.status === "success") result = store.settlePayment(p.reference, tx, config.keyMode);
            else if (tx.status === "abandoned" || tx.status === "failed") result = store.markAbandoned(p.reference, `paystack status ${tx.status}`) ? `closed (paystack status ${tx.status})` : "unchanged";
            else result = `paystack status ${tx.status}`;
            out(`${p.reference}: ${result}`);
          } catch (err) {
            // Paystack does not know the reference (checkout never opened, or made with the other key mode).
            if (err instanceof PaystackError && (err.status === 404 || err.status === 400)) {
              store.markAbandoned(p.reference, "not found at Paystack");
              out(`${p.reference}: closed (not found at Paystack)`);
            } else {
              out(`${p.reference}: verify failed (${(err as Error).message})`);
            }
          }
        }
        break;
      }
      case "settle": {
        const [reference, flag] = args;
        if (!reference) throw new Error("Usage: settle <reference> [--force]");
        const tx = await paystack.verify(reference);
        out(`Paystack: status=${tx.status} charged=${tx.amount} requested=${tx.requestedAmount ?? "-"} currency=${tx.currency} mode=${tx.domain ?? "-"}`);
        if (tx.status !== "success") throw new Error("Paystack does not report this payment as successful; nothing credited");
        out(`Result: ${store.settlePayment(reference, tx, config.keyMode, flag === "--force")}`);
        break;
      }
      case "grant": {
        const [who, creditsRaw, ...reason] = args;
        const credits = Number(creditsRaw);
        if (!who || !Number.isInteger(credits) || credits <= 0 || reason.length === 0) throw new Error("Usage: grant <email|account-id> <credits> <reason>");
        const account = one(store, who);
        store.grant(account.id, credits, `manual:${reason.join(" ")}`);
        out(`Granted ${credits} credits to ${account.id}; balance ${store.getAccount(account.id)!.credits}`);
        break;
      }
      case "reverse": {
        const [reference, ...reason] = args;
        if (!reference || reason.length === 0) throw new Error("Usage: reverse <reference> <reason>");
        out(JSON.stringify(store.reversePayment(reference, `manual:${reason.join(" ")}`)));
        break;
      }
      case "rotate": {
        const account = one(store, args[0] ?? "");
        out(`New connector URL for ${account.email} (the old one no longer works):\n${config.baseUrl}/mcp/${store.rotateToken(account.id)}`);
        break;
      }
      default:
        throw new Error("Commands: status, review, reconcile, settle, grant, reverse, rotate (see the top of src/admin.ts)");
    }
  } finally {
    store.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runAdmin(process.argv.slice(2)).catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
