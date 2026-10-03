const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function trimNumber(value: number, decimals: number): string {
  return value.toFixed(decimals).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

/**
 * Naira amounts in executive shorthand: ₦595M, ₦586.5M, ₦450k, ₦1B.
 * The unit is chosen after rounding, so ₦999.96M prints as ₦1B, not ₦1000M.
 */
export function ngn(value: number, millionDecimals = 1): string {
  if (!Number.isFinite(value)) return "n/a";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1e9 || Number((abs / 1e6).toFixed(millionDecimals)) >= 1000) return `${sign}₦${trimNumber(abs / 1e9, 2)}B`;
  if (abs >= 1e6 || Math.round(abs / 1e3) >= 1000) return `${sign}₦${trimNumber(abs / 1e6, millionDecimals)}M`;
  if (abs >= 1e3 || Math.round(abs) >= 1000) return `${sign}₦${trimNumber(abs / 1e3, 0)}k`;
  return `${sign}₦${Math.round(abs)}`;
}

export function usd(value: number): string {
  if (!Number.isFinite(value)) return "n/a";
  if (value >= 1e6 || Math.round(value / 1e3) >= 1000) return `$${trimNumber(value / 1e6, 2)}M`;
  if (value >= 1e3 || Math.round(value) >= 1000) return `$${Math.round(value / 1e3)}k`;
  return `$${Math.round(value)}`;
}

/** Signed percentage from a ratio: 0.108 -> "+10.8%". */
export function pct(ratio: number, decimals = 1, signed = true): string {
  if (!Number.isFinite(ratio)) return "n/a";
  const value = ratio * 100;
  const text = `${value.toFixed(decimals)}%`;
  return signed && value > 0 ? `+${text}` : text;
}

/** Strict YYYY-MM-DD parser: rejects dates that do not exist (2026-02-30, 2026-13-01). */
export function parseDate(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`Invalid date ${iso}; use YYYY-MM-DD`);
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d || y < 2000) {
    throw new Error(`Invalid date ${iso}: no such calendar day`);
  }
  return date;
}

export function isValidDate(iso: string): boolean {
  try {
    parseDate(iso);
    return true;
  } catch {
    return false;
  }
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function longDate(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** Ceiling that ignores floating-point noise (40.000000001 -> 40). */
export function safeCeil(value: number): number {
  return Math.ceil(value - 1e-9);
}

/** Round to the nearest 5 units of the third significant digit (₦595.3M -> ₦595M). */
export function roundPrice(value: number): number {
  const step = priceStep(value);
  return Math.round(value / step) * step;
}

export function priceStep(value: number): number {
  return 5 * 10 ** (Math.floor(Math.log10(value)) - 2);
}

/**
 * A round price inside [lo, hi], as close to target as the coarsest workable grid allows.
 * Tries the standard price grid first, then finer grids, so rounding never pushes a
 * price outside the window the methodology requires.
 */
export function niceWithin(target: number, lo: number, hi: number): number {
  const base = priceStep(target);
  for (const step of [base, base / 5, base / 25, base / 125]) {
    const candidates = [Math.round(target / step), Math.floor(target / step), Math.ceil(target / step)].map((n) => n * step);
    const inside = candidates.filter((c) => c >= lo - 1e-6 && c <= hi + 1e-6);
    if (inside.length) return inside.sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
  }
  return Math.min(hi, Math.max(lo, Math.round(target)));
}

export function roundTo(value: number, unit: number): number {
  return Math.round(value / unit) * unit;
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
