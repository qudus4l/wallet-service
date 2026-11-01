import { type FormEvent, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '../components/Icon';
import { Brand, Field, focusFirstError, Note, Spinner } from '../components/ui';
import { api, ApiError, errorMessage } from '../lib/api';
import { useApp } from '../lib/app';
import { emailValid, PHONE_PATTERN } from '../lib/format';

/** Public demo customer (seeded by `npm run demo:seed`). The admin password is never shipped. */
const DEMO_CUSTOMER = { email: 'ada@example.com', password: 'wallet-demo' };
const DEMO_ADMIN_EMAIL = import.meta.env.VITE_DEMO_ADMIN_EMAIL || 'admin@example.com';

/** API field names → this form's input ids. */
const FIELD_IDS: Record<string, string> = {
  fullName: 'fullname',
  email: 'email',
  phone: 'phone',
  password: 'password',
};

type Errors = Record<string, string>;
const value = (id: string) => (document.getElementById(id) as HTMLInputElement).value;

export function AuthPage() {
  const { authMessage, setAuthMessage, signIn, busy, toast } = useApp();
  const navigate = useNavigate();
  const [signup, setSignup] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [submit, setSubmit] = useState<'idle' | 'busy'>('idle');
  const [showPassword, setShowPassword] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const toggleMode = () => {
    if (busy.current) return;
    setSignup((s) => !s);
    setErrors({});
    setSubmit('idle');
    setShowPassword(false);
    setAuthMessage(null);
  };

  async function authenticate(e: FormEvent) {
    e.preventDefault();
    if (busy.current) return;
    const email = value('email').trim().toLowerCase();
    const password = value('password');
    const next: Errors = {};
    let fullName = '';
    let phone = '';
    if (signup) {
      fullName = value('fullname').trim();
      phone = value('phone').replace(/[\s-]/g, '');
      if (!fullName || fullName.length > 200)
        next.fullname = 'Enter your full name (up to 200 characters).';
    }
    if (!emailValid(email)) next.email = 'Enter a valid email address.';
    if (signup && phone && !PHONE_PATTERN.test(phone))
      next.phone = 'Enter a valid number with country code.';
    if (password.length < 10 || password.length > 128)
      next.password =
        password.length === 0 ? 'Enter your password.' : 'Your password must be 10–128 characters.';
    setErrors(next);
    if (Object.keys(next).length) {
      focusFirstError(formRef.current);
      return;
    }

    busy.current = true;
    setSubmit('busy');
    try {
      if (signup) await api.register({ email, password, fullName, ...(phone ? { phone } : {}) });
      const user = await signIn(email, password);
      busy.current = false;
      const path = window.location.pathname;
      navigate(user.role === 'ADMIN' ? (path.startsWith('/admin/') ? path : '/admin/users') : '/', {
        replace: true,
      });
      if (signup) toast('Your wallet is ready.');
    } catch (error) {
      busy.current = false;
      const fields: Errors = {};
      if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
        for (const f of error.details?.fields ?? []) {
          const id = FIELD_IDS[f.field];
          if (id && f.errors[0]) fields[id] = f.errors[0];
        }
      }
      if (Object.keys(fields).length) {
        setErrors(fields);
        focusFirstError(formRef.current);
      } else setAuthMessage(errorMessage(error));
      setSubmit('idle');
    }
  }

  const fillLogin = (admin: boolean) => {
    (document.getElementById('email') as HTMLInputElement).value = admin
      ? DEMO_ADMIN_EMAIL
      : DEMO_CUSTOMER.email;
    const password = document.getElementById('password') as HTMLInputElement;
    // The admin password is private, so only the email is filled and the cursor waits for it.
    password.value = admin ? '' : DEMO_CUSTOMER.password;
    (admin ? password : document.getElementById('auth-submit'))?.focus();
  };

  const label = signup ? 'Create account' : 'Sign in';
  return (
    <div className="auth-container">
      <main className="auth-inner">
        <Brand />
        <div className="card form-card" key={signup ? 'signup' : 'signin'}>
          <div className="form-head">
            <h2>{signup ? 'Create your account' : 'Welcome back'}</h2>
            <p>
              {signup ? 'Your NGN wallet is created with your account.' : 'Sign in to your wallet.'}
            </p>
          </div>
          <div id="auth-message" aria-live="polite">
            {authMessage && <Note kind="error">{authMessage}</Note>}
          </div>
          <form id="auth-form" onSubmit={authenticate} noValidate ref={formRef}>
            {signup && (
              <Field
                id="fullname"
                label="Full name"
                autoComplete="name"
                required
                maxLength={200}
                error={errors.fullname}
              />
            )}
            <Field
              id="email"
              label="Email address"
              type="email"
              autoComplete="username"
              required
              maxLength={254}
              error={errors.email}
            />
            {signup && (
              <Field
                id="phone"
                label={
                  <>
                    Phone number <span className="optional">(optional)</span>
                  </>
                }
                type="tel"
                help="Include your country code, e.g. +2348012345678."
                autoComplete="tel"
                error={errors.phone}
              />
            )}
            <div className="field">
              <label htmlFor="password">Password</label>
              <div className="password-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  autoComplete={signup ? 'new-password' : 'current-password'}
                  required
                  minLength={10}
                  maxLength={128}
                  aria-describedby="password-help password-error"
                  aria-invalid={errors.password ? 'true' : undefined}
                />
                <button
                  className="linkbtn show-password"
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <div className="help" id="password-help">
                {signup ? 'Use 10–128 characters.' : ''}
              </div>
              <div className="error-text" id="password-error" role="alert">
                {errors.password}
              </div>
            </div>
            <button
              className="btn primary full"
              type="submit"
              id="auth-submit"
              disabled={submit === 'busy'}
            >
              {submit === 'busy' ? (
                <>
                  <Spinner /> {signup ? 'Creating your wallet…' : 'Signing in…'}
                </>
              ) : (
                <>
                  {label} <Icon name="send" />
                </>
              )}
            </button>
          </form>
          <p className="auth-footer">
            {signup ? 'Already have an account?' : 'New here?'}{' '}
            <button className="linkbtn" onClick={toggleMode}>
              {signup ? 'Sign in' : 'Create an account'}
            </button>
          </p>
          {!signup && (
            <div className="demo-hint">
              <p className="small muted">Try a demo account. No setup needed.</p>
              <div className="row">
                <button className="btn compact full" onClick={() => fillLogin(false)}>
                  Use customer
                </button>
                <button className="btn compact full" onClick={() => fillLogin(true)}>
                  Use admin
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
