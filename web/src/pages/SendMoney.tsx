import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Money } from '../components/Money';
import { Button, ErrorNote, Field } from '../components/ui';
import {
  api,
  ApiError,
  newIdempotencyKey,
  type Recipient,
  type Transaction,
  type Wallet,
} from '../lib/api';
import { formatNaira, parseNaira, shortId } from '../lib/money';

type Step =
  | { name: 'form' }
  | { name: 'confirm'; recipient: Recipient; amount: number }
  | { name: 'done'; recipient: Recipient; transaction: Transaction; replayed: boolean };

/** Errors after which the same payment can safely be retried with the same key. */
const RETRYABLE = new Set(['NETWORK_ERROR', 'TRY_AGAIN', 'INTERNAL_ERROR']);

export function SendMoney({ wallet }: { wallet: Wallet }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [amountText, setAmountText] = useState('');
  const [narration, setNarration] = useState('');
  const [step, setStep] = useState<Step>({ name: 'form' });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  // One key per payment. It survives retries and only changes when the payment itself changes.
  const [key, setKey] = useState(newIdempotencyKey);

  const editing = (setter: (v: string) => void) => (e: { target: { value: string } }) => {
    setter(e.target.value);
    setKey(newIdempotencyKey());
    setError(null);
  };

  async function review(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const amount = parseNaira(amountText);
    if (amount === null || amount <= 0) {
      setError(
        new ApiError(
          400,
          'VALIDATION_ERROR',
          'Enter an amount in naira, for example 1,250 or 1250.50.',
        ),
      );
      return;
    }
    if (amount > wallet.balance) {
      setError(
        new ApiError(422, 'INSUFFICIENT_FUNDS', 'Your balance is too low for this payment.'),
      );
      return;
    }
    setBusy(true);
    try {
      const { data: recipient } = await api.resolveRecipient(email);
      setStep({ name: 'confirm', recipient, amount });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function send(recipient: Recipient, amount: number) {
    setBusy(true);
    setError(null);
    try {
      const { data, replayed } = await api.transfer(
        {
          sourceWalletId: wallet.id,
          destinationWalletId: recipient.walletId,
          amount,
          narration: narration.trim() || undefined,
        },
        key,
      );
      setStep({ name: 'done', recipient, transaction: data, replayed });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wallets'] }),
        queryClient.invalidateQueries({ queryKey: ['history'] }),
      ]);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setEmail('');
    setAmountText('');
    setNarration('');
    setKey(newIdempotencyKey());
    setError(null);
    setStep({ name: 'form' });
  }

  if (step.name === 'done') {
    return (
      <div className="receipt" role="status">
        <p className="receipt__title">
          Sent <Money kobo={step.transaction.amount} size="md" /> to {step.recipient.accountName}
        </p>
        {step.replayed && (
          <p className="receipt__note">
            This payment had already gone through, so it was not sent again. You are seeing the
            original receipt.
          </p>
        )}
        <dl className="receipt__meta">
          <dt>Reference</dt>
          <dd>
            <code>{step.transaction.id}</code>
          </dd>
          {step.transaction.narration && (
            <>
              <dt>Narration</dt>
              <dd>{step.transaction.narration}</dd>
            </>
          )}
        </dl>
        <div className="actions">
          <Button onClick={startOver}>Send another payment</Button>
          <Button
            variant="quiet"
            busy={busy}
            onClick={() => void send(step.recipient, step.transaction.amount)}
          >
            Send the same request again
          </Button>
        </div>
        <p className="key-note">
          “Send the same request again” repeats it with the same key ({shortId(key)}). The server
          recognises it and returns this receipt instead of paying twice.
        </p>
      </div>
    );
  }

  if (step.name === 'confirm') {
    const canRetry = error instanceof ApiError && RETRYABLE.has(error.code);
    return (
      <div className="confirm">
        <p className="confirm__line">
          Pay <strong>{step.recipient.accountName}</strong>
        </p>
        <Money kobo={step.amount} size="lg" />
        <p className="confirm__balance">
          Your balance after this payment: {formatNaira(wallet.balance - step.amount)}
        </p>
        <ErrorNote error={error} />
        <div className="actions">
          <Button onClick={() => void send(step.recipient, step.amount)} busy={busy}>
            {canRetry ? 'Try again' : `Send ${formatNaira(step.amount)}`}
          </Button>
          <Button variant="quiet" onClick={() => setStep({ name: 'form' })} disabled={busy}>
            Edit payment
          </Button>
        </div>
        {canRetry && (
          <p className="key-note">
            Safe to retry: this payment keeps the same key ({shortId(key)}), so it can only go
            through once.
          </p>
        )}
      </div>
    );
  }

  const fieldError = (name: string) =>
    error instanceof ApiError ? error.fieldError(name) : undefined;
  return (
    <form onSubmit={review} noValidate>
      <Field
        label="Recipient’s email"
        type="email"
        value={email}
        onChange={editing(setEmail)}
        error={fieldError('email')}
        placeholder="name@example.com"
        required
      />
      <Field
        label="Amount (₦)"
        inputMode="decimal"
        value={amountText}
        onChange={editing(setAmountText)}
        placeholder="0.00"
        hint={<>Available: {formatNaira(wallet.balance)}</>}
        required
      />
      <Field
        label="Narration (optional)"
        value={narration}
        onChange={editing(setNarration)}
        maxLength={140}
        placeholder="What’s it for?"
      />
      <ErrorNote error={error instanceof ApiError && error.fieldError('email') ? null : error} />
      <Button type="submit" busy={busy} className="button--wide">
        Review payment
      </Button>
    </form>
  );
}
