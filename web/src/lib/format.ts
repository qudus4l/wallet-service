/** Formatting and parsing helpers, ported one-for-one from the approved design. */

/** Kobo → "₦1,234.56". */
export const money = (k: number): string =>
  '₦' +
  Math.floor(Math.abs(k) / 100).toLocaleString('en-NG') +
  '.' +
  String(Math.abs(k) % 100).padStart(2, '0');

/** "1,234.5" → 123450 kobo, using string arithmetic (never floats). Null if invalid. */
export function kobo(v: string): number | null {
  const raw = String(v).trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(raw)) return null;
  const s = raw.replace(/,/g, '');
  const [a = '0', b = ''] = s.split('.');
  const n = BigInt(a) * 100n + BigInt(b.padEnd(2, '0'));
  return n > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(n);
}

export const date = (v: string): string =>
  new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export const time = (v: string): string =>
  new Date(v).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

export const initials = (n: string): string =>
  n
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join('')
    .toUpperCase();

export const emailValid = (v: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

/** Per-payment and per-deposit cap enforced by the API (₦10,000,000.00). */
export const AMOUNT_LIMIT = 1_000_000_000;
