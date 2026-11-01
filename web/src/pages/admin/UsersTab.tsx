import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Money } from '../../components/Money';
import { Button, ErrorNote, Field, StatusTag } from '../../components/ui';
import { type AdminUser, api, newIdempotencyKey } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate, formatNaira, parseNaira } from '../../lib/money';

export function UsersTab() {
  const [search, setSearch] = useState('');
  const [email, setEmail] = useState<string | undefined>();
  const users = useQuery({
    queryKey: ['admin-users', email],
    queryFn: async () => (await api.admin.users(email)).data,
  });

  return (
    <section>
      <form
        className="toolbar"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          setEmail(search.trim() || undefined);
        }}
      >
        <Field
          label="Find by email"
          type="email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="name@example.com"
          hint="Exact match. Leave empty to list the newest accounts."
        />
        <Button type="submit" variant="quiet">
          Search
        </Button>
      </form>
      <ErrorNote error={users.error} />
      {users.data?.data.length === 0 && <p className="muted">No account uses that email.</p>}
      <ul className="user-list">
        {users.data?.data.map((user) => (
          <UserRow key={user.id} user={user} />
        ))}
      </ul>
    </section>
  );
}

type Panel = 'none' | 'fund' | 'block';

function UserRow({ user }: { user: AdminUser }) {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const [panel, setPanel] = useState<Panel>('none');
  const wallet = user.wallets[0];
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] });

  const unblock = useMutation({ mutationFn: () => api.admin.unblock(user.id), onSuccess: refresh });

  return (
    <li className="user-row">
      <div className="user-row__main">
        <div>
          <p className="user-row__name">
            {user.fullName} {user.role === 'ADMIN' && <span className="tag">Admin</span>}
          </p>
          <p className="muted">
            {user.email}, joined {formatDate(user.createdAt)}
          </p>
        </div>
        <StatusTag status={user.status} />
        <div className="user-row__balance">
          {wallet ? <Money kobo={wallet.balance} /> : <span className="muted">No wallet</span>}
        </div>
        <div className="user-row__actions">
          {wallet && (
            <Button variant="quiet" onClick={() => setPanel(panel === 'fund' ? 'none' : 'fund')}>
              Fund wallet
            </Button>
          )}
          {user.id !== me?.id &&
            (user.status === 'ACTIVE' ? (
              <Button
                variant="quiet"
                onClick={() => setPanel(panel === 'block' ? 'none' : 'block')}
              >
                Block
              </Button>
            ) : (
              <Button variant="quiet" busy={unblock.isPending} onClick={() => unblock.mutate()}>
                Unblock
              </Button>
            ))}
        </div>
      </div>
      <ErrorNote error={unblock.error} />
      {panel === 'fund' && wallet && (
        <FundForm
          walletId={wallet.id}
          onDone={() => {
            setPanel('none');
            void refresh();
          }}
        />
      )}
      {panel === 'block' && (
        <BlockForm
          userId={user.id}
          onDone={() => {
            setPanel('none');
            void refresh();
          }}
        />
      )}
    </li>
  );
}

function FundForm({ walletId, onDone }: { walletId: string; onDone: () => void }) {
  const [amountText, setAmountText] = useState('');
  const [key, setKey] = useState(newIdempotencyKey);
  const [localError, setLocalError] = useState<string>();
  const fund = useMutation({
    mutationFn: (amount: number) => api.admin.deposit(walletId, amount, key, 'Funded by admin'),
    onSuccess: onDone,
  });
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        const amount = parseNaira(amountText);
        if (!amount) return setLocalError('Enter an amount in naira, for example 5,000.');
        setLocalError(undefined);
        fund.mutate(amount);
      }}
    >
      <Field
        label="Amount to add (₦)"
        inputMode="decimal"
        value={amountText}
        onChange={(e) => {
          setAmountText(e.target.value);
          setKey(newIdempotencyKey());
        }}
        error={localError}
        hint={
          parseNaira(amountText)
            ? `Adds ${formatNaira(parseNaira(amountText)!)} from the system wallet.`
            : undefined
        }
        autoFocus
      />
      <Button type="submit" busy={fund.isPending}>
        Add funds
      </Button>
      <ErrorNote error={fund.error} />
    </form>
  );
}

function BlockForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const block = useMutation({
    mutationFn: () => api.admin.block(userId, reason),
    onSuccess: onDone,
  });
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        block.mutate();
      }}
    >
      <Field
        label="Reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        hint="Saved in the activity log. Blocking signs the user out at once; they can't send or receive."
        autoFocus
        required
      />
      <Button type="submit" variant="danger" busy={block.isPending} disabled={!reason.trim()}>
        Block user
      </Button>
      <ErrorNote error={block.error} />
    </form>
  );
}
