import { NavLink, Outlet } from "react-router-dom";

export function AdminLayout() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `admin-link${isActive ? " is-active" : ""}`;

  return (
    <section className="admin-shell">
      <aside className="admin-nav" aria-label="Admin">
        <div className="admin-nav-header">
          <h2>Admin</h2>
          <p className="muted">Tools and configuration</p>
        </div>

        <nav className="admin-nav-links" aria-label="Admin sections">
          <NavLink end to="/admin" className={linkClass}>
            Home
          </NavLink>

          <NavLink to="/admin/ceremonies" className={linkClass}>
            Ceremonies
          </NavLink>

          <NavLink to="/admin/users" className={linkClass}>
            Users
          </NavLink>

          <NavLink to="/admin/content" className={linkClass}>
            Content &amp; Messaging
          </NavLink>

          <NavLink to="/admin/system" className={linkClass}>
            System
          </NavLink>
        </nav>
      </aside>

      <div className="admin-content">
        <Outlet />
      </div>
    </section>
  );
}
