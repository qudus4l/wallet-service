import { NavLink, Outlet } from 'react-router';

export function AdminPage() {
  return (
    <div className="admin">
      <h1 className="admin__title">Admin</h1>
      <nav className="tabs" aria-label="Admin sections">
        <NavLink to="/admin" end>
          Users
        </NavLink>
        <NavLink to="/admin/blacklist">Blacklist</NavLink>
        <NavLink to="/admin/activity">Activity log</NavLink>
        <NavLink to="/admin/live-tests">Live tests</NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
