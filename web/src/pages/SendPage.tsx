import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useSetSendStep } from '../App';
import { Icon } from '../components/Icon';
import { AmountField, Detail, Field, focusFirstError, Note, Spinner } from '../components/ui';
import { api, ApiError, errorMessage, newIdempotencyKey } from '../lib/api';
import { useApp } from '../lib/app';
import { AMOUNT_LIMIT, date, emailValid, initials, kobo, money, time } from '../lib/format';
import { useWallet } from './WalletPage';

interface Draft {
  email: string;
  amount: string;
  narration: string;
}
interface Payment {
  key: string;
  body: { sourceWalletId: string; destinationWalletId: string; amount: number; narration?: string };
  recipient: { name: string; email: string };
}
interface Receipt {
  id: string;
  amount: number;
  narration: string | null;
  createdAt: string;
  recipientName: string;
  email: string;
  replayed: boolean;
}
type Errors = Record<string, string>;

/** Shared by the send form and the admin funding form (design: validateAmount). */
export function amountError(raw: string, balance: number | null): string | number {
  const a = kobo(raw);
  if (a === null || a <= 0) return 'Enter an amount greater than ₦0, with up to 2 decimal places.';
  if (a > AMOUNT_LIMIT) return 'The limit is ₦10,000,000.00 per payment.';
  if (balance !== null && a > balance) return 'Your balance is too low for this payment.';
  return a;
}

function Steps({ n }: { n: number }) {
  return (
    <ol className="steps" aria-label="Transfer progress">
      {['Details', 'Review', 'Receipt'].map((x, i) => (
        <li
          key={x}
          className={i < n ? 'done' : i === n ? 'current' : ''}
          aria-current={i === n ? 'step' : undefined}
        >
          <span className="step-no">{i < n ? '✓' : i + 1}</span>
          {x}
        </li>
      ))}
    </ol>
  );
}

export function SendPage() {
  const { user, go, busy } = useApp();
  const queryClient = useQueryClient();
  const setSendStep = useSetSendStep();
  const wallet = useWallet();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>({ email: '', amount: '', narration: '' });
  const [payment, setPayment] = useState<Payment | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  /** Review button: idle, or finding the recipient. */
  const [finding, setFinding] = useState(false);
  /** Confirm button: idle (label + icon), sending, or "Try again" after a failure. */
  const [sending, setSending] = useState<'idle' | 'busy' | 'retry'>('idle');
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => setSendStep(step), [step, setSendStep]);
  useEffect(() => () => setSendStep(0), [setSendStep]);

  if (!wallet.data) return null;
  const w = wallet.data;

  const toStep = (n: number) => {
    setErrors({});
    setMessage(null);
    setSending('idle');
    setStep(n);
  };

  async function reviewPayment(e: FormEvent) {
    e.preventDefault();
    if (busy.current) return;
    const val = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
    const email = val('recipient').trim().toLowerCase();
    const rawAmount = val('amount');
    const narration = val('narration').trim();
    const next: Errors = {};
    const amount = amountError(rawAmount, w.balance);
    if (typeof amount === 'string') next.amount = amount;
    if (!emailValid(email)) next.recipient = 'Enter a valid email address.';
    else if (email === user!.email) next.recipient = 'You can’t send money to your own wallet.';
    if (narration.length > 140) next.narration = 'Use 140 characters or fewer.';
    setErrors(next);
    if (Object.keys(next).length || typeof amount === 'string') {
      focusFirstError(formRef.current);
      return;
    }
    setDraft({ email, amount: rawAmount, narration });
    busy.current = true;
    setFinding(true);
    try {
      const { data: r } = await api.resolveRecipient(email);
      busy.current = false;
      const body = {
        sourceWalletId: w.id,
        destinationWalletId: r.walletId,
        amount,
        ...(narration ? { narration } : {}),
      };
      // One key per payment: kept while the payment is unchanged, replaced when it changes.
      if (!payment || JSON.stringify(payment.body) !== JSON.stringify(body)) {
        setPayment({ key: newIdempotencyKey(), body, recipient: { name: r.accountName, email } });
      }
      setFinding(false);
      toStep(1);
    } catch (error) {
      busy.current = false;
      setFinding(false);
      if (error instanceof ApiError && error.code === 'NOT_FOUND') {
        setErrors({
          recipient: 'No wallet found for this email. Check the address and try again.',
        });
        document.getElementById('recipient')?.focus();
      } else setMessage(errorMessage(error));
    }
  }

  async function sendPayment() {
    if (busy.current || !payment) return;
    busy.current = true;
    setSending('busy');
    try {
      const { data, replayed } = await api.transfer(payment.body, payment.key);
      busy.current = false;
      setReceipt({
        id: data.id,
        amount: data.amount,
        narration: data.narration,
        createdAt: data.createdAt,
        recipientName: payment.recipient.name,
        email: payment.recipient.email,
        replayed,
      });
      void queryClient.invalidateQueries({ queryKey: ['wallet'] });
      void queryClient.invalidateQueries({ queryKey: ['history'] });
      toStep(2);
    } catch (error) {
      busy.current = false;
      setMessage(errorMessage(error));
      setSending('retry');
    }
  }

  const editPayment = () => {
    if (busy.current) return;
    toStep(0);
  };

  return (
    <div className="form-width">
      <button className="linkbtn back" onClick={() => go('/')}>
        <Icon name="back" /> Back to wallet
      </button>
      <Steps n={step} />
      <div className="card form-card">
        {step === 0 ? (
          <>
            <div className="form-head">
              <h2>Send money</h2>
              <p>Pay someone using their account email.</p>
            </div>
            <form id="send-form" onSubmit={reviewPayment} noValidate ref={formRef}>
              <Field
                id="recipient"
                label="Recipient email"
                type="email"
                defaultValue={draft.email}
                help="Demo recipient: bob@example.com"
                autoComplete="email"
                required
                maxLength={254}
                error={errors.recipient}
              />
              <AmountField
                id="amount"
                defaultValue={draft.amount}
                help={
                  <>
                    Available: <strong className="money">{money(w.balance)}</strong>
                    {' · Limit: ₦10,000,000.00'}
                  </>
                }
                error={errors.amount}
              />
              <Field
                id="narration"
                label={
                  <>
                    Note <span className="optional">(optional)</span>
                  </>
                }
                defaultValue={draft.narration}
                help="Appears in your transaction history."
                maxLength={140}
                placeholder="What’s it for?"
                error={errors.narration}
              />
              <div id="send-message" aria-live="polite">
                {message && <Note kind="error">{message}</Note>}
              </div>
              <button className="btn primary full" id="review-btn" type="submit" disabled={finding}>
                {finding ? (
                  <>
                    <Spinner /> Finding recipient…
                  </>
                ) : (
                  <>
                    Review transfer <Icon name="send" />
                  </>
                )}
              </button>
              <p className="help" style={{ textAlign: 'center', marginTop: 13 }}>
                You’ll check the recipient before sending.
              </p>
            </form>
          </>
        ) : step === 1 && payment ? (
          <>
            <div className="form-head">
              <h2>Review transfer</h2>
              <p>Check everything looks right.</p>
            </div>
            <div className="review-top">
              <div className="avatar">{initials(payment.recipient.name)}</div>
              <p>Pay {payment.recipient.name}</p>
              <div className="review-amount money">{money(payment.body.amount)}</div>
            </div>
            <dl className="review-list">
              <Detail label="Recipient">{payment.recipient.name}</Detail>
              <Detail label="Email">{payment.recipient.email}</Detail>
              <Detail label="From">Your NGN wallet</Detail>
              <Detail label="Note">{payment.body.narration || '—'}</Detail>
              <Detail label="Balance after">
                <strong className="money">{money(w.balance - payment.body.amount)}</strong>
              </Detail>
            </dl>
            <div id="payment-message" aria-live="polite">
              {message && <Note kind="error">{message}</Note>}
            </div>
            <button
              className="btn primary full"
              id="confirm-btn"
              onClick={sendPayment}
              disabled={sending === 'busy'}
            >
              {sending === 'busy' ? (
                <>
                  <Spinner /> Sending…
                </>
              ) : sending === 'retry' ? (
                'Try again'
              ) : (
                <>
                  Send {money(payment.body.amount)} <Icon name="send" />
                </>
              )}
            </button>
            <button
              className="btn quiet full"
              style={{ marginTop: 8 }}
              onClick={editPayment}
              id="edit-btn"
              disabled={sending === 'busy'}
            >
              Edit details
            </button>
          </>
        ) : receipt ? (
          <>
            <div className="review-top">
              <div className="success-mark">
                <Icon name="check" />
              </div>
              <h2>Money sent</h2>
              <div className="review-amount money">{money(receipt.amount)}</div>
              <p>to {receipt.recipientName}</p>
            </div>
            {receipt.replayed && (
              <Note kind="success">
                This payment had already gone through, so it wasn’t sent again.
              </Note>
            )}
            <dl className="review-list">
              <Detail label="Status">
                <span className="pill">Completed</span>
              </Detail>
              <Detail label="Recipient">{receipt.recipientName}</Detail>
              <Detail label="Email">{receipt.email}</Detail>
              <Detail label="Date">
                {date(receipt.createdAt) + ' · ' + time(receipt.createdAt)}
              </Detail>
              <Detail label="Note">{receipt.narration || '—'}</Detail>
              <Detail label="Reference">
                <span className="mono">{receipt.id}</span>
              </Detail>
            </dl>
            <button className="btn primary full" onClick={() => go('/')}>
              Back to wallet
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
