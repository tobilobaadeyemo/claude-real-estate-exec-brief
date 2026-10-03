const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function trimNumber(value: number, decimals: number): string {
  return value.toFixed(decimals).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

/** Naira amounts in executive shorthand: ₦595M, ₦586.5M, ₦0.5M, ₦65k. */
export function ngn(value: number, millionDecimals = 1): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${sign}₦${trimNumber(abs / 1e9, 2)}B`;
  if (abs >= 1e5) return `${sign}₦${trimNumber(abs / 1e6, millionDecimals)}M`;
  if (abs >= 1e3) return `${sign}₦${trimNumber(abs / 1e3, 0)}k`;
  return `${sign}₦${Math.round(abs)}`;
}

export function usd(value: number): string {
  if (value >= 1e6) return `$${trimNumber(value / 1e6, 2)}M`;
  return `$${Math.round(value / 1e3)}k`;
}

/** Signed percentage from a ratio: 0.108 -> "+10.8%". */
export function pct(ratio: number, decimals = 1, signed = true): string {
  const value = ratio * 100;
  const text = `${value.toFixed(decimals)}%`;
  return signed && value > 0 ? `+${text}` : text;
}

export function parseDate(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`Invalid date ${iso}; use YYYY-MM-DD`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
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

export function roundTo(value: number, unit: number): number {
  return Math.round(value / unit) * unit;
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
