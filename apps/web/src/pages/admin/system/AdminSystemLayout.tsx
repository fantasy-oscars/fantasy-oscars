import { NavLink, Outlet } from "react-router-dom";

export function AdminSystemLayout() {
  const sublinkClass = ({ isActive }: { isActive: boolean }) =>
    `admin-sublink${isActive ? " is-active" : ""}`;

  return (
    <section className="card">
      <header>
        <h2>System</h2>
        <p className="muted">Operational tools and audit trails.</p>
      </header>

      <nav className="admin-subnav" aria-label="System admin">
        <NavLink to="/admin/system/audit" className={sublinkClass}>
          Audit Log
        </NavLink>
      </nav>

      <Outlet />
    </section>
  );
}
