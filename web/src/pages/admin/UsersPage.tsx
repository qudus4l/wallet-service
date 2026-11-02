import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import {
  AmountField,
  Detail,
  Empty,
  Field,
  focusFirstError,
  Note,
  PageHead,
  Spinner,
  StatusPill,
  TextAreaField,
} from '../../components/ui';
import { type AdminUser, api, ApiError, errorMessage, newIdempotencyKey } from '../../lib/api';
import { useApp } from '../../lib/app';
import { date, initials, money } from '../../lib/format';
import { amountError } from '../SendPage';

const balanceOf = (u: AdminUser) => u.wallets[0]?.balance ?? 0;

export function UsersPage() {
  const { user: me, userQuery, setUserQuery, openModal, closeModal } = useApp();
  const users = useInfiniteQuery({
    queryKey: ['admin-users', userQuery],
    queryFn: async ({ pageParam }) => {
      try {
        return (await api.admin.users(userQuery || undefined, pageParam)).data;
      } catch (error) {
        // Not a valid email: nothing can match an exact-email search.
        if (error instanceof ApiError && error.code === 'VALIDATION_ERROR')
          return { data: [], nextCursor: null, total: 0 };
        throw error;
      }
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const search = (e: FormEvent) => {
    e.preventDefault();
    setUserQuery(
      (document.getElementById('user-search') as HTMLInputElement).value.trim().toLowerCase(),
    );
  };

  const list = users.data?.pages.flatMap((p) => p.data) ?? [];
  const total = users.data?.pages.at(-1)?.total ?? list.length;

  const userDetails = (u: AdminUser) =>
    openModal(
      u.fullName,
      'Account details',
      <>
        <dl className="review-list">
          <Detail label="Email">{u.email}</Detail>
          <Detail label="Phone">{u.phone || 'Not provided'}</Detail>
          <Detail label="Status">
            <StatusPill status={u.status} />
          </Detail>
          <Detail label="Role">{u.role === 'ADMIN' ? 'Administrator' : 'Customer'}</Detail>
          <Detail label="Joined">{date(u.createdAt)}</Detail>
          <Detail label="User ID">
            <span className="mono">{u.id}</span>
          </Detail>
          {u.wallets[0] && (
            <>
              <Detail label="Wallet ID">
                <span className="mono">{u.wallets[0].id}</span>
              </Detail>
              <Detail label="Balance">{money(u.wallets[0].balance)}</Detail>
            </>
          )}
        </dl>
        <button className="btn full" onClick={closeModal}>
          Done
        </button>
      </>,
    );

  const fundModal = (u: AdminUser) =>
    openModal('Fund wallet', `Add money to ${u.fullName}’s wallet.`, <FundForm u={u} />);

  const blockModal = (u: AdminUser) => {
    if (u.id === me!.id) return;
    const block = u.status === 'ACTIVE';
    openModal(
      `${block ? 'Block' : 'Unblock'} ${u.fullName}?`,
      block
        ? 'They will be signed out and lose access immediately.'
        : 'They will be able to sign in and use their wallet again.',
      <BlockForm u={u} />,
    );
  };

  return (
    <>
      <PageHead title="Users" sub="Find an account, fund a wallet, or manage access." />
      <div className="card">
        <div className="toolbar">
          <form className="searchbox" onSubmit={search}>
            <div className="field">
              <label htmlFor="user-search" className="sr-only">
                Search by exact email
              </label>
              <input
                id="user-search"
                type="search"
                defaultValue={userQuery}
                key={userQuery}
                placeholder="Search by exact email"
                autoComplete="off"
              />
            </div>
            <button className="btn" type="submit">
              <Icon name="search" /> Search
            </button>
            {userQuery && (
              <button className="btn quiet compact" type="button" onClick={() => setUserQuery('')}>
                Clear
              </button>
            )}
          </form>
          <span className="muted small">{userQuery ? 'Exact match' : 'Newest accounts first'}</span>
        </div>
        {users.error && !users.data ? (
          <Note kind="error">{errorMessage(users.error)}</Note>
        ) : !users.data ? null : list.length ? (
          <>
            <div className="table-wrap">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Name / Email</th>
                    <th>Status</th>
                    <th className="right">Wallet balance</th>
                    <th className="right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="user-cell">
                          <div className="avatar">{initials(u.fullName)}</div>
                          <div>
                            <button className="linkbtn row-name" onClick={() => userDetails(u)}>
                              {u.fullName}
                            </button>
                            <div className="subline">
                              {u.email}
                              {u.role === 'ADMIN' ? ' · Admin' : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <StatusPill status={u.status} />
                      </td>
                      <td className="right money">
                        {u.role === 'ADMIN' ? (
                          <span className="muted">No wallet</span>
                        ) : (
                          money(balanceOf(u))
                        )}
                      </td>
                      <td>
                        <div className="user-actions">
                          {u.role === 'USER' && (
                            <button
                              className="btn compact"
                              onClick={() => fundModal(u)}
                              disabled={u.status === 'BLOCKED'}
                              title={
                                u.status === 'BLOCKED'
                                  ? 'Unblock this account before funding'
                                  : undefined
                              }
                            >
                              Fund wallet
                            </button>
                          )}
                          <button
                            className={`btn compact quiet ${u.status === 'ACTIVE' ? 'dangertext' : ''}`}
                            onClick={() => blockModal(u)}
                            disabled={u.id === me!.id}
                            title={u.id === me!.id ? 'You can’t block your own account' : undefined}
                          >
                            {u.status === 'ACTIVE' ? 'Block' : 'Unblock'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <span>
                {list.length} of {total} accounts
              </span>
              {users.hasNextPage ? (
                <button
                  className="btn compact"
                  onClick={() => !users.isFetchingNextPage && users.fetchNextPage()}
                >
                  Load more
                </button>
              ) : (
                <span>All accounts shown</span>
              )}
            </div>
          </>
        ) : (
          <Empty
            title="No account found"
            sub="Check the email address. Search uses an exact email match."
            icon="search"
          />
        )}
      </div>
    </>
  );
}

function FundForm({ u }: { u: AdminUser }) {
  const { openModal, closeModal } = useApp();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);

  const fundReview = (e: FormEvent) => {
    e.preventDefault();
    const amount = amountError(
      (document.getElementById('fund-amount') as HTMLInputElement).value,
      null,
    );
    if (typeof amount === 'string') {
      setErrors({ 'fund-amount': amount });
      focusFirstError(formRef.current);
      return;
    }
    const narration = (document.getElementById('fund-note') as HTMLInputElement).value.trim();
    if (narration.length > 140) {
      setErrors({ 'fund-note': 'Use 140 characters or fewer.' });
      return;
    }
    openModal(
      'Confirm funding',
      'Check the account and amount before adding money.',
      <FundConfirm
        u={u}
        amount={amount}
        narration={narration}
        idempotencyKey={newIdempotencyKey()}
      />,
    );
  };

  return (
    <>
      <div className="notice" style={{ marginBottom: 22 }}>
        <div>
          <strong>{u.email}</strong>
          <br />
          Current balance: <span className="money">{money(balanceOf(u))}</span>
        </div>
      </div>
      <form onSubmit={fundReview} noValidate ref={formRef}>
        <AmountField
          id="fund-amount"
          help="Maximum ₦10,000,000.00 per deposit."
          error={errors['fund-amount']}
        />
        <Field
          id="fund-note"
          label={
            <>
              Note <span className="optional">(optional)</span>
            </>
          }
          maxLength={140}
          placeholder="e.g. Wallet top-up"
          error={errors['fund-note']}
        />
        <div className="action-row">
          <button className="btn" type="button" onClick={closeModal}>
            Cancel
          </button>
          <button className="btn primary" type="submit">
            Review funding
          </button>
        </div>
      </form>
    </>
  );
}

function FundConfirm({
  u,
  amount,
  narration,
  idempotencyKey,
}: {
  u: AdminUser;
  amount: number;
  narration: string;
  idempotencyKey: string;
}) {
  const { busy, closeModal, toast } = useApp();
  const queryClient = useQueryClient();
  const [state, setState] = useState<'idle' | 'busy' | 'unavailable' | 'retry'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function fundCommit() {
    if (busy.current) return;
    busy.current = true;
    setState('busy');
    try {
      await api.admin.deposit(u.wallets[0]!.id, amount, idempotencyKey, narration || undefined);
      busy.current = false;
      closeModal();
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
      toast(`${money(amount)} added to ${u.fullName}’s wallet.`);
    } catch (error) {
      busy.current = false;
      setMessage(errorMessage(error));
      // An account that can't receive money won't succeed on retry, so only Cancel stays
      // useful. Other failures (network, busy server) can be retried with the same key.
      setState(
        error instanceof ApiError && error.code === 'RECIPIENT_UNAVAILABLE'
          ? 'unavailable'
          : 'retry',
      );
    }
  }

  return (
    <>
      <div className="review-top">
        <p>Fund {u.fullName}</p>
        <div className="review-amount">{money(amount)}</div>
      </div>
      <dl className="review-list">
        <Detail label="Account">{u.email}</Detail>
        <Detail label="Note">{narration || '—'}</Detail>
        <Detail label="Balance after">{money(balanceOf(u) + amount)}</Detail>
      </dl>
      <div id="fund-message" aria-live="polite">
        {message && <Note kind="error">{message}</Note>}
      </div>
      <div className="action-row">
        <button className="btn" id="fund-cancel" onClick={closeModal} disabled={state === 'busy'}>
          Cancel
        </button>
        <button
          className="btn primary"
          id="fund-confirm"
          onClick={fundCommit}
          disabled={state === 'busy' || state === 'unavailable'}
        >
          {state === 'busy' ? (
            <>
              <Spinner /> Funding…
            </>
          ) : state === 'retry' ? (
            'Try again'
          ) : (
            'Fund wallet'
          )}
        </button>
      </div>
    </>
  );
}

function BlockForm({ u }: { u: AdminUser }) {
  const { busy, closeModal, toast } = useApp();
  const queryClient = useQueryClient();
  const block = u.status === 'ACTIVE';
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function blockCommit(e: FormEvent) {
    e.preventDefault();
    if (busy.current) return;
    const textarea = document.getElementById('block-reason') as HTMLTextAreaElement;
    const reason = textarea.value.trim();
    if ((block && !reason) || reason.length > 500) {
      setError('Enter a reason of 1–500 characters.');
      textarea.focus();
      return;
    }
    setError(undefined);
    busy.current = true;
    setPending(true);
    try {
      if (block) await api.admin.block(u.id, reason);
      else await api.admin.unblock(u.id, reason || undefined);
      busy.current = false;
      closeModal();
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
      toast(`${u.fullName}’s account ${block ? 'blocked' : 'unblocked'}.`);
    } catch (err) {
      busy.current = false;
      setPending(false);
      setError(errorMessage(err));
    }
  }

  return (
    <form onSubmit={blockCommit} noValidate>
      <TextAreaField
        id="block-reason"
        label={<>Reason {block ? '' : <span className="optional">(optional)</span>}</>}
        placeholder={block ? 'Why are you blocking this account?' : 'e.g. Account review completed'}
        error={error}
      />
      <div className="action-row">
        <button className="btn" type="button" onClick={closeModal} disabled={pending}>
          Cancel
        </button>
        <button className={`btn ${block ? 'danger' : 'primary'}`} type="submit" disabled={pending}>
          {block ? 'Block account' : 'Unblock account'}
        </button>
      </div>
    </form>
  );
}
