import { usePasswordResetRequestOrchestration } from "@/orchestration/auth";
import { ForgotPasswordScreen } from "@/features/auth/screens/ForgotPasswordScreen";

export function ForgotPasswordPage() {
  const { errors, result, loading, sent, onSubmit, onInput } =
    usePasswordResetRequestOrchestration();
  return (
    <ForgotPasswordScreen
      errors={errors}
      result={result}
      loading={loading}
      sent={sent}
      onInput={onInput}
      onSubmit={onSubmit}
    />
  );
}
