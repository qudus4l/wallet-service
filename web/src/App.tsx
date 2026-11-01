import { type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { AuthProvider, useAuth } from './lib/auth';
import { ActivityTab } from './pages/admin/ActivityTab';
import { AdminPage } from './pages/admin/AdminPage';
import { BlacklistTab } from './pages/admin/BlacklistTab';
import { LiveTestsTab } from './pages/admin/LiveTestsTab';
import { UsersTab } from './pages/admin/UsersTab';
import { AuthPage } from './pages/AuthPage';
import { Dashboard } from './pages/Dashboard';

function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Loading your wallet…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== 'ADMIN') return <Navigate to="/" replace />;
  return children;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Loading…</div>;
  return user ? <Navigate to={home(user.role)} replace /> : children;
}

/** Customers land on their wallet; administrators, who hold no wallet, on the admin area. */
function Home() {
  const { user } = useAuth();
  return user?.role === 'ADMIN' ? <Navigate to="/admin" replace /> : <Dashboard />;
}

const home = (role: string) => (role === 'ADMIN' ? '/admin' : '/');

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route
            path="/login"
            element={
              <GuestOnly>
                <AuthPage mode="login" />
              </GuestOnly>
            }
          />
          <Route
            path="/register"
            element={
              <GuestOnly>
                <AuthPage mode="register" />
              </GuestOnly>
            }
          />
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route index element={<Home />} />
            <Route
              path="admin"
              element={
                <RequireAuth admin>
                  <AdminPage />
                </RequireAuth>
              }
            >
              <Route index element={<UsersTab />} />
              <Route path="blacklist" element={<BlacklistTab />} />
              <Route path="activity" element={<ActivityTab />} />
              <Route path="live-tests" element={<LiveTestsTab />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
