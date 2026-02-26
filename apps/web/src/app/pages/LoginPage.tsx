import { useLocation, useNavigate } from "react-router-dom";
import { useAuthContext } from "@/auth/context";
import { useLoginOrchestration } from "@/orchestration/auth";
import { LoginScreen } from "@/features/auth/screens/LoginScreen";

export function LoginPage() {
  const { login } = useAuthContext();
  const { errors, result, loading, onSubmit } = useLoginOrchestration({ login });
  const navigate = useNavigate();
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  const rawFrom =
    search.get("next") ?? (location.state as { from?: string } | null)?.from ?? "/";
  const from =
    rawFrom.startsWith("/") && !rawFrom.startsWith("//") && !rawFrom.startsWith("/login")
      ? rawFrom
      : "/";
  const registerHref = `/register?next=${encodeURIComponent(from)}`;

  async function onSubmitAndRedirect(e: React.FormEvent<HTMLFormElement>) {
    const res = await onSubmit(e);
    if (res.ok) navigate(from, { replace: true });
  }

  return (
    <LoginScreen
      errors={errors}
      result={result}
      loading={loading}
      registerHref={registerHref}
      onSubmit={onSubmitAndRedirect}
    />
  );
}
