import { createContext, useContext, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { Icon, type IconName } from './components/Icon';
import { Brand, Modal, Toast } from './components/ui';
import { useApp } from './lib/app';
import { initials } from './lib/format';
import { ActivityPage } from './pages/admin/ActivityPage';
import { BlacklistPage } from './pages/admin/BlacklistPage';
import { TestsPage } from './pages/admin/TestsPage';
import { UsersPage } from './pages/admin/UsersPage';
import { AuthPage } from './pages/AuthPage';
import { SendPage } from './pages/SendPage';
import { WalletPage } from './pages/WalletPage';

type NavEntry = [path: string, icon: IconName, label: string];

const CUSTOMER_NAV: NavEntry[] = [
  ['/', 'wallet', 'My wallet'],
  ['/send', 'send', 'Send money'],
];
const ADMIN_NAV: NavEntry[] = [
  ['/admin/users', 'users', 'Users'],
  ['/admin/blacklist', 'block', 'Blacklist'],
  ['/admin/activity', 'log', 'Activity log'],
  ['/admin/tests', 'test', 'Live tests'],
];
const TITLES: Record<string, string> = {
  '/': 'My wallet',
  '/send': 'Send money',
  '/admin/users': 'Users',
  '/admin/blacklist': 'Blacklist',
  '/admin/activity': 'Activity log',
  '/admin/tests': 'Live tests',
};

/** The send flow's step (0 details, 1 review, 2 receipt), for the breadcrumb and nav state. */
const SendStepContext = createContext<(step: number) => void>(() => {});
export const useSetSendStep = () => useContext(SendStepContext);

export function App() {
  const { user, booting } = useApp();
  return (
    <>
      {booting ? null : user ? <Shell /> : <AuthPage />}
      <Modal />
      <Toast />
    </>
  );
}

function Shell() {
  const { user, signOut, go, sendFlow } = useApp();
  const { pathname } = useLocation();
  const [sendStep, setSendStep] = useState(0);
  const admin = user!.role === 'ADMIN';
  const entries = admin ? ADMIN_NAV : CUSTOMER_NAV;
  const known = entries.some(([p]) => p === pathname);
  if (!known) return <Navigate to={entries[0]![0]} replace />;

  const title = pathname === '/send' && sendStep === 2 ? 'Transfer receipt' : TITLES[pathname];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="row between">
          <Brand />
          <button className="btn quiet compact mobile-signout hidden" onClick={() => signOut()}>
            <Icon name="logout" /> Sign out
          </button>
        </div>
        <div className="nav-label">{admin ? 'Administration' : 'Your account'}</div>
        <nav className="nav" aria-label="Main navigation">
          {entries.map(([p, icon, label]) => {
            const current = p === pathname && !(p === '/send' && sendStep > 0);
            return (
              <button
                key={p}
                onClick={() => go(p)}
                className={p === pathname ? 'active' : ''}
                aria-current={current ? 'page' : undefined}
              >
                <Icon name={icon} />
                {label}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="account">
            <div className="avatar">{initials(user!.fullName)}</div>
            <div>
              <strong>{user!.fullName}</strong>
              <span className="muted small">{admin ? 'Administrator' : 'Personal account'}</span>
            </div>
          </div>
          <button className="btn quiet compact signout" onClick={() => signOut()}>
            <Icon name="logout" /> Sign out
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <span>{admin ? 'Administration' : 'Personal account'}</span>
            <Icon name="chevron" />
            <span>{title}</span>
          </div>
          <div className="row">
            <span className="muted top-email">{user!.email}</span>
            <div className="avatar">{initials(user!.fullName)}</div>
          </div>
        </header>
        <main className="content" id="main">
          <SendStepContext.Provider value={setSendStep}>
            <Routes>
              {admin ? (
                <>
                  <Route path="/admin/users" element={<UsersPage />} />
                  <Route path="/admin/blacklist" element={<BlacklistPage />} />
                  <Route path="/admin/activity" element={<ActivityPage />} />
                  <Route path="/admin/tests" element={<TestsPage />} />
                </>
              ) : (
                <>
                  <Route path="/" element={<WalletPage />} />
                  <Route path="/send" element={<SendPage key={sendFlow} />} />
                </>
              )}
            </Routes>
          </SendStepContext.Provider>
          <footer className="page-foot">
            <span>Wallet Service · {admin ? 'Admin workspace' : 'NGN wallet'}</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
