import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, ErrorNote, Field } from '../../components/ui';
import { api, ApiError, type BlacklistEntry } from '../../lib/api';
import { formatDate } from '../../lib/money';

type IdentityType = BlacklistEntry['type'];

export function BlacklistTab() {
  const queryClient = useQueryClient();
  const entries = useQuery({
    queryKey: ['blacklist'],
    queryFn: async () => (await api.admin.blacklist()).data,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['blacklist'] });

  return (
    <div className="split">
      <section>
        <h2>Blacklisted identities</h2>
        <p className="muted">
          A listed email or phone cannot open an account, and an existing account using it can’t
          send or receive money. People are told only that their account is restricted, never why.
        </p>
        <ErrorNote error={entries.error} />
        {entries.data?.data.length === 0 && <p className="muted">The blacklist is empty.</p>}
        <ul className="entry-list">
          {entries.data?.data.map((entry) => (
            <EntryRow key={entry.id} entry={entry} onRemoved={refresh} />
          ))}
        </ul>
      </section>
      <aside className="side-forms">
        <AddForm onAdded={refresh} />
        <CheckForm />
      </aside>
    </div>
  );
}

function EntryRow({ entry, onRemoved }: { entry: BlacklistEntry; onRemoved: () => void }) {
  const remove = useMutation({
    mutationFn: () => api.admin.removeFromBlacklist(entry.id),
    onSuccess: onRemoved,
  });
  return (
    <li className="entry">
      <div>
        <p>
          <span className="tag">{entry.type === 'EMAIL' ? 'Email' : 'Phone'}</span> {entry.value}
        </p>
        <p className="muted">
          {entry.reason}, added {formatDate(entry.createdAt)}
        </p>
      </div>
      <Button variant="quiet" busy={remove.isPending} onClick={() => remove.mutate()}>
        Remove
      </Button>
      <ErrorNote error={remove.error} />
    </li>
  );
}

function TypePicker({
  value,
  onChange,
}: {
  value: IdentityType;
  onChange: (t: IdentityType) => void;
}) {
  return (
    <fieldset className="segmented">
      <legend>Identity</legend>
      {(['EMAIL', 'PHONE'] as const).map((t) => (
        <label key={t}>
          <input
            type="radio"
            name={`type-${t}`}
            checked={value === t}
            onChange={() => onChange(t)}
          />
          {t === 'EMAIL' ? 'Email' : 'Phone'}
        </label>
      ))}
    </fieldset>
  );
}

function AddForm({ onAdded }: { onAdded: () => void }) {
  const [type, setType] = useState<IdentityType>('EMAIL');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const add = useMutation({
    mutationFn: () => api.admin.addToBlacklist({ type, value, reason }),
    onSuccess: () => {
      setValue('');
      setReason('');
      onAdded();
    },
  });
  const fieldError = (f: string) =>
    add.error instanceof ApiError ? add.error.fieldError(f) : undefined;
  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <h2>Add to blacklist</h2>
      <TypePicker value={type} onChange={setType} />
      <Field
        label={type === 'EMAIL' ? 'Email address' : 'Phone number'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={type === 'EMAIL' ? 'name@example.com' : '+234 801 234 5678'}
        error={fieldError('value')}
      />
      <Field
        label="Reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        error={fieldError('reason')}
        hint="Internal only."
      />
      <ErrorNote
        error={
          add.error instanceof ApiError &&
          add.error.code === 'VALIDATION_ERROR' &&
          add.error.details
            ? null
            : add.error
        }
      />
      <Button type="submit" busy={add.isPending} disabled={!value.trim() || !reason.trim()}>
        Add to blacklist
      </Button>
    </form>
  );
}

function CheckForm() {
  const [type, setType] = useState<IdentityType>('EMAIL');
  const [value, setValue] = useState('');
  const check = useMutation({
    mutationFn: async () => (await api.admin.checkBlacklist(type, value)).data,
  });
  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        check.mutate();
      }}
    >
      <h2>Check an identity</h2>
      <TypePicker
        value={type}
        onChange={(t) => {
          setType(t);
          check.reset();
        }}
      />
      <Field
        label={type === 'EMAIL' ? 'Email address' : 'Phone number'}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          check.reset();
        }}
      />
      <Button type="submit" variant="quiet" busy={check.isPending} disabled={!value.trim()}>
        Check
      </Button>
      {check.data && (
        <p
          className={`check-result check-result--${check.data.listed ? 'listed' : 'clear'}`}
          role="status"
        >
          {check.data.listed ? `Listed: ${check.data.entry?.reason}` : 'Not on the blacklist.'}
        </p>
      )}
      <ErrorNote error={check.error} />
    </form>
  );
}
