import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Detail, Empty, Field, Note, PageHead } from '../components/ui';
import { api, errorMessage, type LedgerEntry } from '../lib/api';
import { useApp } from '../lib/app';
import { date, money, time } from '../lib/format';

export function useWallet() {
  return useQuery({
    queryKey: ['wallet'],
    queryFn: async () => (await api.wallets()).data[0] ?? null,
  });
}

export function useHistory(walletId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['history', walletId],
    queryFn: async ({ pageParam }) => (await api.history(walletId!, pageParam)).data,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(walletId),
  });
}

const label = (t: LedgerEntry) =>
  t.type === 'DEPOSIT' ? 'Wallet funded' : t.direction === 'DEBIT' ? 'Sent' : 'Received';
const sign = (t: LedgerEntry) => (t.direction === 'CREDIT' ? '+' : '−');

export function WalletPage() {
  const { user, go, openModal, closeModal } = useApp();
  const wallet = useWallet();
  const history = useHistory(wallet.data?.id);
  const head = (
    <PageHead
      title="My wallet"
      sub={`Welcome back, ${user!.fullName.split(' ')[0]}. Here’s your money at a glance.`}
    />
  );
  const failed = wallet.error ?? history.error;
  if (failed)
    return (
      <>
        {head}
        <Note kind="error">{errorMessage(failed)}</Note>
      </>
    );
  if (!wallet.data || !history.data) return head;

  const w = wallet.data;
  const rows = history.data.pages.flatMap((p) => p.data);
  const total = history.data.pages.at(-1)?.total ?? rows.length;
  const [whole, decimals] = money(w.balance).split('.');

  const details = (t: LedgerEntry) =>
    openModal(
      'Transaction details',
      'Your completed wallet activity.',
      <>
        <div className="review-top">
          <div className="review-amount money">
            {sign(t)}
            {money(t.amount)}
          </div>
          <span className="pill">Completed</span>
        </div>
        <dl className="review-list">
          <Detail label="Type">{label(t)}</Detail>
          <Detail label="Date">{date(t.createdAt) + ' · ' + time(t.createdAt)}</Detail>
          <Detail label="Note">{t.narration || '—'}</Detail>
          <Detail label="Balance after">{money(t.balanceAfter)}</Detail>
          {t.counterpartyWalletId && (
            <Detail label="Other wallet">
              <span className="mono">{t.counterpartyWalletId}</span>
            </Detail>
          )}
          <Detail label="Reference">
            <span className="mono">{t.transactionId}</span>
          </Detail>
        </dl>
        <button className="btn full" onClick={closeModal}>
          Done
        </button>
      </>,
    );

  return (
    <>
      {head}
      <div className="balance-grid">
        <section className="balance-card" aria-label="Wallet balance">
          <span className="eyebrow">Available balance</span>
          <div className="balance-value money">
            {whole}
            <span className="decimals">.{decimals}</span>
          </div>
          <div className="balance-bottom">
            <button className="btn primary" onClick={() => go('/send')}>
              <Icon name="send" /> Send money
            </button>
            <span className="currency">
              <span className="flag" aria-hidden="true" /> Nigerian naira
            </span>
          </div>
        </section>
        <section className="wallet-card">
          <div>
            <h3>Your wallet details</h3>
            <p>One wallet for sending and receiving naira.</p>
            <div className="wallet-id">
              <span className="small muted">Wallet ID</span>
              <br />
              <span className="mono">{w.id}</span>
            </div>
          </div>
          <CopyButton text={w.id} />
        </section>
      </div>
      <section>
        <div className="section-head">
          <div>
            <h2>Recent activity</h2>
            <p>Money in, money out. All in one place.</p>
          </div>
          <span className="small muted">Newest first</span>
        </div>
        <div className="card">
          {rows.length ? (
            <>
              <div className="table-wrap">
                <table className="activity-table">
                  <thead>
                    <tr>
                      <th>Transaction</th>
                      <th>Date</th>
                      <th className="right">Amount</th>
                      <th className="right">Balance after</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((t) => (
                      <tr key={t.id}>
                        <td className="name-cell">
                          <div className="activity-name">
                            <div
                              className={`movement-icon ${t.direction === 'CREDIT' ? 'in' : ''}`}
                            >
                              <Icon
                                name={
                                  t.type === 'DEPOSIT'
                                    ? 'plus'
                                    : t.direction === 'DEBIT'
                                      ? 'send'
                                      : 'down'
                                }
                              />
                            </div>
                            <div>
                              <button className="linkbtn row-name" onClick={() => details(t)}>
                                {label(t)}
                              </button>
                              <div className="subline">{t.narration || 'Wallet transfer'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="date-cell">
                          {date(t.createdAt)}
                          <div className="subline">{time(t.createdAt)}</div>
                        </td>
                        <td
                          className={`amount-cell money right ${t.direction === 'CREDIT' ? 'positive' : ''}`}
                        >
                          {sign(t)}
                          {money(t.amount)}
                        </td>
                        <td className="balance-cell right money">{money(t.balanceAfter)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-footer">
                <span>
                  {rows.length} of {total} transactions
                </span>
                {history.hasNextPage ? (
                  <button
                    className="btn compact"
                    onClick={() => !history.isFetchingNextPage && history.fetchNextPage()}
                  >
                    Load more
                  </button>
                ) : (
                  <span>You’re all caught up</span>
                )}
              </div>
            </>
          ) : (
            <Empty
              title="Your wallet is ready"
              sub="Your activity will appear here once your wallet is funded or you receive a transfer."
            />
          )}
        </div>
      </section>
    </>
  );
}

function CopyButton({ text }: { text: string }) {
  const { openModal } = useApp();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      openModal(
        'Copy wallet ID',
        'Select and copy the wallet ID below.',
        <Field id="copy-fallback" label="Wallet ID" defaultValue={text} readOnly />,
      );
      setTimeout(() => (document.getElementById('copy-fallback') as HTMLInputElement)?.select());
    }
  };
  return (
    <button className="btn compact copy-btn" onClick={copy}>
      {copied ? (
        <>
          <Icon name="check" /> Copied
        </>
      ) : (
        <>
          <Icon name="copy" /> Copy wallet ID
        </>
      )}
    </button>
  );
}
