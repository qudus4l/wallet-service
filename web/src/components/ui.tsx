import { type ComponentPropsWithRef, type ReactNode, useEffect, useRef } from 'react';
import { type UserStatus } from '../lib/api';
import { useApp } from '../lib/app';
import { Icon, type IconName } from './Icon';

/**
 * The design's markup helpers (note, field, amountField, detail, status, brand, head, empty),
 * reproduced element for element so the copied stylesheet applies unchanged.
 */

export function Note({
  kind = '',
  children,
}: {
  kind?: '' | 'error' | 'success' | 'warning';
  children: ReactNode;
}) {
  return (
    <div className={`notice ${kind}`}>
      <Icon name={kind === 'success' ? 'check' : 'info'} />
      <span>{children}</span>
    </div>
  );
}

type InputProps = Omit<ComponentPropsWithRef<'input'>, 'id' | 'type' | 'defaultValue'>;

export function Field({
  id,
  label,
  type = 'text',
  defaultValue = '',
  help,
  error,
  ...extra
}: InputProps & {
  id: string;
  label: ReactNode;
  type?: string;
  defaultValue?: string;
  help?: ReactNode;
  error?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={id}
        type={type}
        defaultValue={defaultValue}
        {...extra}
        aria-describedby={`${id}-help ${id}-error`}
        aria-invalid={error ? 'true' : undefined}
      />
      {help ? (
        <div className="help" id={`${id}-help`}>
          {help}
        </div>
      ) : (
        <span id={`${id}-help`} />
      )}
      <div className="error-text" id={`${id}-error`} role="alert">
        {error}
      </div>
    </div>
  );
}

export function AmountField({
  id,
  defaultValue = '',
  help,
  error,
}: {
  id: string;
  defaultValue?: string;
  help: ReactNode;
  error?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>Amount</label>
      <div className="amount-input">
        <span className="prefix">₦</span>
        <input
          id={id}
          name={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          defaultValue={defaultValue}
          aria-describedby={`${id}-help ${id}-error`}
          aria-invalid={error ? 'true' : undefined}
        />
        <span className="suffix">NGN</span>
      </div>
      <div className="help" id={`${id}-help`}>
        {help}
      </div>
      <div className="error-text" id={`${id}-error`} role="alert">
        {error}
      </div>
    </div>
  );
}

export function TextAreaField({
  id,
  label,
  placeholder,
  error,
}: {
  id: string;
  label: ReactNode;
  placeholder: string;
  error?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        maxLength={500}
        aria-describedby={`${id}-error`}
        placeholder={placeholder}
        aria-invalid={error ? 'true' : undefined}
      />
      <div className="error-text" id={`${id}-error`} role="alert">
        {error}
      </div>
    </div>
  );
}

export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function StatusPill({ status }: { status: UserStatus }) {
  return (
    <span className={`pill ${status === 'BLOCKED' ? 'blocked' : ''}`}>
      {status === 'BLOCKED' ? 'Blocked' : 'Active'}
    </span>
  );
}

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Icon name="wallet" />
      </span>
      Wallet<span style={{ color: '#819374' }}>.</span>
    </div>
  );
}

export function PageHead({
  title,
  sub,
  action,
}: {
  title: string;
  sub: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
      {action}
    </div>
  );
}

export function Empty({
  title,
  sub,
  icon = 'wallet',
}: {
  title: string;
  sub: string;
  icon?: IconName;
}) {
  return (
    <div className="empty">
      <div className="movement-icon">
        <Icon name={icon} />
      </div>
      <h3>{title}</h3>
      <p>{sub}</p>
    </div>
  );
}

export const Spinner = () => <span className="spinner" />;

/** Focus the first invalid control, in document order (design: firstError). */
export function focusFirstError(form: HTMLElement | null) {
  requestAnimationFrame(() => form?.querySelector<HTMLElement>('[aria-invalid=true]')?.focus());
}

/** The design's single <dialog id="modal">, driven by app state. */
export function Modal() {
  const { modal, closeModal, busy } = useApp();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (modal) {
      if (!dialog.open) dialog.showModal();
      const timer = setTimeout(
        () =>
          (
            dialog.querySelector<HTMLElement>('input:not([readonly]),textarea,select') ??
            dialog.querySelector<HTMLElement>('button')
          )?.focus(),
        25,
      );
      return () => clearTimeout(timer);
    }
    if (dialog.open) dialog.close();
  }, [modal]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      if (!busy.current) closeModal();
    };
    dialog.addEventListener('cancel', onCancel);
    return () => dialog.removeEventListener('cancel', onCancel);
  }, [busy, closeModal]);

  return (
    <dialog id="modal" aria-labelledby="modal-title" ref={ref}>
      {modal && (
        <div className="modal-body">
          <div className="modal-head">
            <div>
              <h2 id="modal-title">{modal.title}</h2>
              <p>{modal.sub}</p>
            </div>
            <button className="close" onClick={closeModal} aria-label="Close dialog">
              <Icon name="close" />
            </button>
          </div>
          {modal.body}
        </div>
      )}
    </dialog>
  );
}

export function Toast() {
  const { toastText } = useApp();
  return (
    <div id="toast" className={`toast ${toastText ? '' : 'hidden'}`} role="status">
      {toastText}
    </div>
  );
}
