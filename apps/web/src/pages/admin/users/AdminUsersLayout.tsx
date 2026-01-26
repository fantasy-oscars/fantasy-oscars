import { NavLink, Outlet } from "react-router-dom";

export function AdminUsersLayout() {
  const sublinkClass = ({ isActive }: { isActive: boolean }) =>
    `admin-sublink${isActive ? " is-active" : ""}`;

  return (
    <section className="card">
      <header>
        <h2>Users</h2>
        <p className="muted">Search for accounts and manage roles.</p>
      </header>

      <nav className="admin-subnav" aria-label="User admin">
        <NavLink end to="/admin/users" className={sublinkClass}>
          Search
        </NavLink>
      </nav>

      <Outlet />
    </section>
  );
}
