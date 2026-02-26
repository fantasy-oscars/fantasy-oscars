import { useLocation, useNavigate } from "react-router-dom";
import { useAuthContext } from "@/auth/context";
import { useRegisterOrchestration } from "@/orchestration/auth";
import { RegisterScreen } from "@/features/auth/screens/RegisterScreen";

export function RegisterPage() {
  const { register } = useAuthContext();
  const { errors, result, loading, onSubmit } = useRegisterOrchestration({ register });
  const navigate = useNavigate();
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  const rawNext = search.get("next") ?? "/";
  const next =
    rawNext.startsWith("/") &&
    !rawNext.startsWith("//") &&
    !rawNext.startsWith("/register")
      ? rawNext
      : "/";
  const loginHref = `/login?next=${encodeURIComponent(next)}`;

  async function onSubmitAndRedirect(e: React.FormEvent<HTMLFormElement>) {
    const res = await onSubmit(e);
    if (res.ok) navigate(next, { replace: true });
  }

  return (
    <RegisterScreen
      errors={errors}
      result={result}
      loading={loading}
      loginHref={loginHref}
      onSubmit={onSubmitAndRedirect}
    />
  );
}
