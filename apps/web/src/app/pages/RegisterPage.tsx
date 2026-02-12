import { useNavigate } from "react-router-dom";
import { useAuthContext } from "@/auth/context";
import { useRegisterOrchestration } from "@/orchestration/auth";
import { RegisterScreen } from "@/screens/auth/RegisterScreen";

export function RegisterPage() {
  const { register } = useAuthContext();
  const { errors, result, loading, onSubmit } = useRegisterOrchestration({ register });
  const navigate = useNavigate();

  async function onSubmitAndRedirect(e: React.FormEvent<HTMLFormElement>) {
    const res = await onSubmit(e);
    if (res.ok) navigate("/", { replace: true });
  }

  return (
    <RegisterScreen
      errors={errors}
      result={result}
      loading={loading}
      onSubmit={onSubmitAndRedirect}
    />
  );
}
