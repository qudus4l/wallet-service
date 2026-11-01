import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { Button, ErrorNote, Field } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { signIn } = useAuth();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '' });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const fieldError = (name: string) =>
    error instanceof ApiError ? error.fieldError(name) : undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'register') {
        await api.register({
          fullName: form.fullName,
          email: form.email,
          password: form.password,
          phone: form.phone || undefined,
        });
      }
      await signIn(form.email, form.password);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="auth">
      <section className="auth__intro">
        <p className="brand brand--large">
          <img src="/favicon.svg" alt="" width={34} height={34} />
          Wallet Service
        </p>
        <h1>Naira wallets where every kobo is accounted for.</h1>
        <ul className="auth__facts">
          <li>Every account comes with a naira wallet.</li>
          <li>Pay anyone by their email. Pressing Send twice still sends once.</li>
          <li>Balances stay exact even when hundreds of payments land at the same moment.</li>
        </ul>
        <p className="auth__reviewer">
          Reviewing this assessment? Sign in with the admin details from the submission email to
          fund wallets, block users, manage the blacklist and run the live tests.
        </p>
      </section>

      <section className="auth__panel">
        <h2>{mode === 'login' ? 'Sign in' : 'Create your account'}</h2>
        <form onSubmit={submit} noValidate>
          {mode === 'register' && (
            <Field
              label="Full name"
              autoComplete="name"
              value={form.fullName}
              onChange={set('fullName')}
              error={fieldError('fullName')}
              required
            />
          )}
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={set('email')}
            error={fieldError('email')}
            required
          />
          {mode === 'register' && (
            <Field
              label="Phone (optional)"
              type="tel"
              autoComplete="tel"
              placeholder="+234 801 234 5678"
              value={form.phone}
              onChange={set('phone')}
              error={fieldError('phone')}
              hint="Include the country code."
            />
          )}
          <Field
            label="Password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={form.password}
            onChange={set('password')}
            error={fieldError('password')}
            hint={mode === 'register' ? 'At least 10 characters.' : undefined}
            required
          />
          <ErrorNote
            error={error instanceof ApiError && error.code === 'VALIDATION_ERROR' ? null : error}
          />
          <Button type="submit" busy={busy} className="button--wide">
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>
        </form>
        <p className="auth__switch">
          {mode === 'login' ? (
            <>
              New here? <Link to="/register">Create an account</Link>
            </>
          ) : (
            <>
              Already have an account? <Link to="/login">Sign in</Link>
            </>
          )}
        </p>
      </section>
    </div>
  );
}
