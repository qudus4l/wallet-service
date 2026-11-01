import { splitKobo } from '../lib/money';

interface MoneyProps {
  kobo: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Show an explicit + or − (ledger rows). */
  signed?: boolean;
  tone?: 'credit' | 'debit';
}

/** Naira set large, kobo set small and raised: the API stores money in kobo, and so does the type. */
export function Money({ kobo, size = 'md', signed = false, tone }: MoneyProps) {
  const { negative, naira, kobo: minor } = splitKobo(kobo);
  const sign = signed ? (negative ? '−' : '+') : negative ? '−' : '';
  return (
    <span
      className={`money money--${size}${tone ? ` money--${tone}` : ''}`}
      aria-label={`${sign === '−' ? 'minus ' : ''}${naira} naira ${minor} kobo`}
    >
      {sign && <span className="money__sign">{sign}</span>}
      <span className="money__currency">₦</span>
      {naira}
      <span className="money__kobo">.{minor}</span>
    </span>
  );
}
