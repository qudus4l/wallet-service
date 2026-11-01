/** All amounts are integers in kobo (1 naira = 100 kobo). No floating point anywhere. */

export function splitKobo(kobo: number): { negative: boolean; naira: string; kobo: string } {
  const abs = Math.abs(kobo);
  return {
    negative: kobo < 0,
    naira: Math.floor(abs / 100).toLocaleString('en-NG'),
    kobo: String(abs % 100).padStart(2, '0'),
  };
}

export function formatNaira(kobo: number): string {
  const { negative, naira, kobo: k } = splitKobo(kobo);
  return `${negative ? '−' : ''}₦${naira}.${k}`;
}

/**
 * Parses what a person types ("1,250", "1250.5", "₦ 12.05") into kobo using string
 * arithmetic, so 0.1 + 0.2 problems cannot occur. Returns null if the input is not money.
 */
export function parseNaira(input: string): number | null {
  const cleaned = input.replace(/[₦,\s]/g, '');
  const match = /^(\d{1,13})(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) return null;
  const naira = Number(match[1]);
  const kobo = Number((match[2] ?? '').padEnd(2, '0'));
  return naira * 100 + kobo;
}

export function shortId(id: string): string {
  return id.slice(-8);
}

const dateFormat = new Intl.DateTimeFormat('en-NG', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
export const formatDate = (iso: string) => dateFormat.format(new Date(iso));
