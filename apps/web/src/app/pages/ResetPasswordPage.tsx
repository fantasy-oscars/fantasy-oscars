import { useNavigate } from "react-router-dom";
import { useAuthContext } from "@/auth/context";
import {
  usePasswordResetConfirmOrchestration,
  useResetTokenFromUrl
} from "@/orchestration/auth";
import { ResetPasswordScreen } from "@/features/auth/screens/ResetPasswordScreen";

export function ResetPasswordPage() {
  const token = useResetTokenFromUrl();
  const { refresh } = useAuthContext();
  const { errors, result, loading, linkInvalid, onSubmit, onInput } =
    usePasswordResetConfirmOrchestration({ token });
  const navigate = useNavigate();

  async function onSubmitAndRedirect(e: React.FormEvent<HTMLFormElement>) {
    const res = await onSubmit(e);
    if (!res.ok) return;
    // A reset signs the account out everywhere, this browser included.
    await refresh();
    navigate("/login", { replace: true });
  }

  return (
    <ResetPasswordScreen
      errors={errors}
      result={result}
      loading={loading}
      linkInvalid={linkInvalid}
      onInput={onInput}
      onSubmit={onSubmitAndRedirect}
    />
  );
}
