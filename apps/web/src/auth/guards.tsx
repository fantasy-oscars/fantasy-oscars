import { Navigate, useLocation } from "react-router-dom";
import { Box, Card, Text, Title } from "@ui";
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
      <Card className="card" component="section">
        <Box component="header">
          <Title order={2}>Admin</Title>
          <Text className="muted">Admins only</Text>
        </Box>
        <Box className="status status-error" role="status">
          You do not have access to the admin console.
        </Box>
      </Card>
    );
  }
  return <>{children}</>;
}

export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { user } = useAuthContext();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";
  if (user) return <Navigate to={from} replace />;
  return <>{children}</>;
}
