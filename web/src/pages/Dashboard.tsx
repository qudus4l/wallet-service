import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Money } from '../components/Money';
import { api } from '../lib/api';
import { formatDate, shortId } from '../lib/money';
import { SendMoney } from './SendMoney';

export function Dashboard() {
  const wallets = useQuery({
    queryKey: ['wallets'],
    queryFn: async () => (await api.wallets()).data,
  });
  const wallet = wallets.data?.[0];

  return (
    <div className="dashboard">
      <section className="balance" aria-labelledby="balance-label">
        <p id="balance-label" className="balance__label">
          Available balance
        </p>
        {wallet ? (
          <Money kobo={wallet.balance} size="xl" />
        ) : (
          <span className="skeleton skeleton--xl" />
        )}
        {wallet && <WalletId id={wallet.id} />}
      </section>

      <section className="send" aria-labelledby="send-title">
        <h2 id="send-title">Send money</h2>
        {wallet ? <SendMoney wallet={wallet} /> : <span className="skeleton" />}
      </section>

      <section className="ledger" aria-labelledby="ledger-title">
        <h2 id="ledger-title">Activity</h2>
        {wallet && <Ledger walletId={wallet.id} />}
      </section>
    </div>
  );
}

function WalletId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <p className="balance__wallet">
      Wallet <code>{id}</code>
      <button
        type="button"
        className="link-button"
        onClick={() => {
          void navigator.clipboard.writeText(id).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </p>
  );
}

function Ledger({ walletId }: { walletId: string }) {
  const history = useInfiniteQuery({
    queryKey: ['history', walletId],
    queryFn: async ({ pageParam }) => (await api.history(walletId, pageParam)).data,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const entries = history.data?.pages.flatMap((p) => p.data) ?? [];

  if (history.isPending) return <span className="skeleton" />;
  if (entries.length === 0) {
    return (
      <p className="ledger__empty">
        No activity yet. Money you receive or send will be listed here, with the balance after each
        entry.
      </p>
    );
  }
  return (
    <>
      <table className="passbook">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Details</th>
            <th scope="col" className="num">
              Amount
            </th>
            <th scope="col" className="num">
              Balance
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td className="passbook__date">{formatDate(entry.createdAt)}</td>
              <td>
                <span className="passbook__what">
                  {entry.type === 'DEPOSIT'
                    ? 'Wallet funded'
                    : entry.direction === 'DEBIT'
                      ? 'Sent'
                      : 'Received'}
                </span>
                <span className="passbook__detail">
                  {entry.narration ?? `Ref ${shortId(entry.transactionId)}`}
                </span>
                <span className="passbook__date-inline">{formatDate(entry.createdAt)}</span>
              </td>
              <td className="num">
                <Money
                  kobo={entry.direction === 'DEBIT' ? -entry.amount : entry.amount}
                  signed
                  size="sm"
                  tone={entry.direction === 'DEBIT' ? 'debit' : 'credit'}
                />
              </td>
              <td className="num">
                <Money kobo={entry.balanceAfter} size="sm" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {history.hasNextPage && (
        <button
          type="button"
          className="link-button ledger__more"
          onClick={() => void history.fetchNextPage()}
          disabled={history.isFetchingNextPage}
        >
          {history.isFetchingNextPage ? 'Loading…' : 'Show older activity'}
        </button>
      )}
    </>
  );
}
