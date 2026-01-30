import { useResetConfirmOrchestration } from "../orchestration/auth";
import { ResetConfirmScreen } from "../screens/auth/ResetConfirmScreen";

export function ResetConfirmPage() {
  const { errors, result, loading, onSubmit } = useResetConfirmOrchestration();
  return (
    <ResetConfirmScreen
      errors={errors}
      result={result}
      loading={loading}
      onSubmit={(e) => void onSubmit(e)}
    />
  );
}
