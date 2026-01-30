import { Navigate, useLocation } from "react-router-dom";
import { useAuthContext } from "./context";
import { PageLoader } from "../ui/page-state";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthContext();
  const location = useLocation();
  if (loading) return <PageLoader label="Checking session..." />;
  if (!user) {
    const returnTo = `${location.pathname}${location.search ?? ""}${location.hash ?? ""}`;
    return <Navigate to="/login" state={{ from: returnTo }} replace />;
  }
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthContext();
  const location = useLocation();
  if (loading) return <PageLoader label="Checking session..." />;
  if (!user) {
    const returnTo = `${location.pathname}${location.search ?? ""}${location.hash ?? ""}`;
    return <Navigate to="/login" state={{ from: returnTo }} replace />;
  }
  if (!user.is_admin) {
    return (
      <section className="card">
        <header>
          <h2>Admin</h2>
          <p className="muted">Admins only</p>
        </header>
        <div className="status status-error" role="status">
          You do not have access to the admin console.
        </div>
      </section>
    );
  }
  return <>{children}</>;
}

export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthContext();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";
  if (loading) return <PageLoader label="Checking session..." />;
  if (user) return <Navigate to={from} replace />;
  return <>{children}</>;
}
