import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../lib/auth';

export function AppShell() {
  const { user, signOut } = useAuth();
  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" className="brand" aria-label="Wallet Service home">
          <img src="/favicon.svg" alt="" width={26} height={26} />
          Wallet Service
        </NavLink>
        <nav className="topbar__nav" aria-label="Main">
          {user?.role === 'ADMIN' ? (
            <NavLink to="/admin">Admin</NavLink>
          ) : (
            <NavLink to="/" end>
              My wallet
            </NavLink>
          )}
        </nav>
        <div className="topbar__user">
          <span className="topbar__name">{user?.fullName}</span>
          <button type="button" className="link-button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
