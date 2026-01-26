import { Outlet } from "react-router-dom";

export function AdminContentLayout() {
  return (
    <section className="card">
      <header>
        <h2>Content</h2>
        <p className="muted">Manage what the app says and shows.</p>
      </header>

      <Outlet />
    </section>
  );
}
