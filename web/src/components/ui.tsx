import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, useId } from 'react';
import { ApiError } from '../lib/api';

export function Button({
  variant = 'primary',
  busy = false,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'quiet' | 'danger';
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      className={`button button--${variant} ${props.className ?? ''}`}
      disabled={props.disabled || busy}
      aria-busy={busy}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string }) {
  const id = useId();
  return (
    <div className={`field${error ? ' field--invalid' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-invalid={Boolean(error)} aria-describedby={`${id}-note`} {...props} />
      <p id={`${id}-note`} className="field__note" role={error ? 'alert' : undefined}>
        {error ?? hint}
      </p>
    </div>
  );
}

/** Explains an API failure in plain words, keeping the code visible for engineers. */
export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const apiError = error instanceof ApiError ? error : null;
  const message = apiError ? friendlyMessage(apiError) : 'Something went wrong. Try again.';
  return (
    <p className="error-note" role="alert">
      {message}
      {apiError && apiError.code !== 'NETWORK_ERROR' && <code>{apiError.code}</code>}
    </p>
  );
}

const MESSAGES: Record<string, string> = {
  RATE_LIMITED: 'Too many attempts in a short time. Wait a minute, then try again.',
  ACCOUNT_BLOCKED: 'This account is blocked. Contact support to restore access.',
  ACCOUNT_RESTRICTED: 'This account cannot be used for that. Contact support.',
  RECIPIENT_UNAVAILABLE: 'That account cannot receive money right now.',
  INSUFFICIENT_FUNDS: 'Your balance is too low for this payment.',
  TRY_AGAIN: 'The service is busy. Try again in a moment; you will not be charged twice.',
};

export function friendlyMessage(error: ApiError): string {
  return MESSAGES[error.code] ?? error.message;
}

export function StatusTag({ status }: { status: 'ACTIVE' | 'BLOCKED' }) {
  return (
    <span className={`tag tag--${status.toLowerCase()}`}>
      {status === 'ACTIVE' ? 'Active' : 'Blocked'}
    </span>
  );
}
