import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Empty, Field, focusFirstError, Note, PageHead, TextAreaField } from '../../components/ui';
import { api, ApiError, type BlacklistEntry, errorMessage, type IdentityType } from '../../lib/api';
import { useApp } from '../../lib/app';
import { date, emailValid, PHONE_PATTERN } from '../../lib/format';

export function BlacklistPage() {
  const { openModal, closeModal } = useApp();
  const entries = useInfiniteQuery({
    queryKey: ['blacklist'],
    queryFn: async ({ pageParam }) => (await api.admin.blacklist(pageParam)).data,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const list = entries.data?.pages.flatMap((p) => p.data) ?? [];
  const total = entries.data?.pages.at(-1)?.total ?? list.length;

  const blackModal = (mode: 'add' | 'check') =>
    openModal(
      mode === 'add' ? 'Add to blacklist' : 'Check an identity',
      mode === 'add'
        ? 'Restrict an email address or phone number.'
        : 'See whether this email or phone number is listed.',
      <IdentityForm mode={mode} />,
    );

  const removeBlack = (x: BlacklistEntry) =>
    openModal(
      'Remove from blacklist?',
      x.value,
      <>
        <p className="muted" style={{ fontSize: 13 }}>
          This identity will no longer be restricted by this entry. A blocked account stays blocked
          until you unblock it.
        </p>
        <RemoveActions x={x} onCancel={closeModal} />
      </>,
    );

  return (
    <>
      <PageHead
        title="Blacklist"
        sub="Manage email addresses and phone numbers restricted from using the service."
        action={
          <button className="btn primary" onClick={() => blackModal('add')}>
            <Icon name="plus" /> Add entry
          </button>
        }
      />
      <div className="notice" style={{ marginBottom: 24 }}>
        <Icon name="info" />
        <span>To stop access for an existing account, block that user on the Users page.</span>
      </div>
      <div className="card">
        <div className="toolbar">
          <h3>Restricted identities</h3>
          <button className="btn compact" onClick={() => blackModal('check')}>
            <Icon name="search" /> Check an identity
          </button>
        </div>
        {entries.error && !entries.data ? (
          <Note kind="error">{errorMessage(entries.error)}</Note>
        ) : !entries.data ? null : list.length ? (
          <>
            <div className="table-wrap">
              <table style={{ minWidth: 620 }}>
                <thead>
                  <tr>
                    <th>Identity</th>
                    <th>Reason</th>
                    <th>Added</th>
                    <th className="right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((x) => (
                    <tr key={x.id}>
                      <td>
                        {x.value}
                        <div className="subline">
                          {x.type === 'EMAIL' ? 'Email address' : 'Phone number'}
                        </div>
                      </td>
                      <td>{x.reason}</td>
                      <td>{date(x.createdAt)}</td>
                      <td className="right">
                        <button
                          className="btn quiet compact dangertext"
                          onClick={() => removeBlack(x)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <span>
                {list.length} of {total} entries
              </span>
              {entries.hasNextPage ? (
                <button
                  className="btn compact"
                  onClick={() => !entries.isFetchingNextPage && entries.fetchNextPage()}
                >
                  Load more
                </button>
              ) : (
                <span>All entries shown</span>
              )}
            </div>
          </>
        ) : (
          <Empty
            title="No restricted identities"
            sub="Add an email address or phone number when an identity needs to be restricted."
            icon="shield"
          />
        )}
      </div>
    </>
  );
}

function IdentityForm({ mode }: { mode: 'add' | 'check' }) {
  const { busy, closeModal, toast } = useApp();
  const queryClient = useQueryClient();
  const [type, setType] = useState<IdentityType>('EMAIL');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ listed: boolean; reason: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const valueRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const phone = type === 'PHONE';

  const identityTypeChanged = (next: IdentityType) => {
    setType(next);
    if (valueRef.current) valueRef.current.value = '';
    setResult(null);
    setMessage(null);
    setErrors(({ 'identity-value': _cleared, ...rest }) => rest);
  };

  async function blackSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy.current) return;
    const raw = valueRef.current!.value.trim().toLowerCase();
    const value = phone ? raw.replace(/[\s-]/g, '') : raw;
    const next: Record<string, string> = {};
    if (!(phone ? PHONE_PATTERN.test(value) : emailValid(value)))
      next['identity-value'] = phone
        ? 'Enter a phone number with its country code.'
        : 'Enter a valid email address.';
    const reason =
      mode === 'add'
        ? (document.getElementById('identity-reason') as HTMLTextAreaElement).value.trim()
        : '';
    if (mode === 'add' && (!reason || reason.length > 500))
      next['identity-reason'] = 'Enter a reason of 1–500 characters.';
    setErrors(next);
    if (Object.keys(next).length) {
      focusFirstError(formRef.current);
      return;
    }

    busy.current = true;
    setPending(true);
    setMessage(null);
    try {
      if (mode === 'check') {
        const { data } = await api.admin.checkBlacklist(type, value);
        setResult({ listed: data.listed, reason: data.entry?.reason ?? '' });
      } else {
        await api.admin.addToBlacklist({ type, value, reason });
        busy.current = false;
        closeModal();
        void queryClient.invalidateQueries({ queryKey: ['blacklist'] });
        void queryClient.invalidateQueries({ queryKey: ['audit'] });
        toast('Identity added to the blacklist.');
        return;
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === 'BLACKLIST_ENTRY_EXISTS')
        setErrors({ 'identity-value': 'Already on the blacklist.' });
      else setMessage(errorMessage(error));
    }
    busy.current = false;
    setPending(false);
  }

  return (
    <form onSubmit={blackSubmit} noValidate ref={formRef}>
      <div className="field">
        <label htmlFor="identity-type">Identity type</label>
        <select
          id="identity-type"
          value={type}
          onChange={(e) => identityTypeChanged(e.target.value as IdentityType)}
        >
          <option value="EMAIL">Email address</option>
          <option value="PHONE">Phone number</option>
        </select>
      </div>
      <Field
        id="identity-value"
        label={phone ? 'Phone number' : 'Email address'}
        type={phone ? 'tel' : 'email'}
        placeholder={phone ? '+2348012345678' : 'name@example.com'}
        help={phone ? 'Include the country code.' : undefined}
        error={errors['identity-value']}
        ref={valueRef}
      />
      {mode === 'add' && (
        <TextAreaField
          id="identity-reason"
          label="Reason"
          placeholder="Why is this identity being restricted?"
          error={errors['identity-reason']}
        />
      )}
      <div id="identity-result" aria-live="polite">
        {result && (
          <Note kind={result.listed ? 'warning' : 'success'}>
            {result.listed ? (
              <>
                <strong>Listed</strong>
                <br />
                {result.reason}
              </>
            ) : (
              <>
                <strong>Not listed</strong>
                <br />
                This identity is not on the blacklist.
              </>
            )}
          </Note>
        )}
        {message && <Note kind="error">{message}</Note>}
      </div>
      <div className="action-row">
        <button className="btn" type="button" onClick={closeModal}>
          Cancel
        </button>
        <button
          className={`btn ${mode === 'add' ? 'danger' : 'primary'}`}
          type="submit"
          disabled={pending}
        >
          {mode === 'add' ? 'Add to blacklist' : 'Check identity'}
        </button>
      </div>
    </form>
  );
}

function RemoveActions({ x, onCancel }: { x: BlacklistEntry; onCancel: () => void }) {
  const { busy, closeModal, toast } = useApp();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function commitRemoveBlack() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      await api.admin.removeFromBlacklist(x.id);
    } catch (error) {
      // Already gone (404) is the outcome the admin asked for.
      if (!(error instanceof ApiError && error.code === 'NOT_FOUND')) {
        busy.current = false;
        setPending(false);
        setMessage(errorMessage(error));
        return;
      }
    }
    busy.current = false;
    closeModal();
    void queryClient.invalidateQueries({ queryKey: ['blacklist'] });
    void queryClient.invalidateQueries({ queryKey: ['audit'] });
    toast('Entry removed.');
  }

  return (
    <>
      {message && <Note kind="error">{message}</Note>}
      <div className="action-row">
        <button className="btn" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
        <button className="btn primary" onClick={commitRemoveBlack} disabled={pending}>
          Remove entry
        </button>
      </div>
    </>
  );
}
