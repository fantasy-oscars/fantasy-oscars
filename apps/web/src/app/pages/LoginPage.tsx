import { useLocation, useNavigate } from "react-router-dom";
import { useAuthContext } from "@/auth/context";
import { useLoginOrchestration } from "@/orchestration/auth";
import { LoginScreen } from "@/features/auth/screens/LoginScreen";

export function LoginPage() {
  const { login } = useAuthContext();
  const { errors, result, loading, onSubmit } = useLoginOrchestration({ login });
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  async function onSubmitAndRedirect(e: React.FormEvent<HTMLFormElement>) {
    const res = await onSubmit(e);
    if (res.ok) navigate(from, { replace: true });
  }

  return (
    <LoginScreen
      errors={errors}
      result={result}
      loading={loading}
      onSubmit={onSubmitAndRedirect}
    />
  );
}
