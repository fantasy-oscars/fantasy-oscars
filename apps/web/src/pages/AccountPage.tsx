import { Link } from "react-router-dom";
import { useAuthContext } from "../auth/context";

export function AccountPage() {
  const { user, logout } = useAuthContext();
  return (
    <section className="card">
      <header>
        <h2>Account</h2>
        <p>Manage your profile and security.</p>
      </header>
      <div className="stack">
        <p className="muted">Signed in as {user?.username ?? user?.sub ?? "unknown"}.</p>
        <ul className="pill-list">
          <li className="pill">Username: {user?.username ?? "—"}</li>
          <li className="pill">Email: {user?.email ?? "—"}</li>
        </ul>
        <div className="inline-actions">
          <button type="button" onClick={() => void logout()}>
            Logout
          </button>
          <Link className="ghost" to="/reset">
            Password reset
          </Link>
        </div>
      </div>
    </section>
  );
}
