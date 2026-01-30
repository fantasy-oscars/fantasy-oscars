import { useResetRequestOrchestration } from "../orchestration/auth";
import { ResetRequestScreen } from "../screens/auth/ResetRequestScreen";

export function ResetRequestPage() {
  const { errors, result, loading, onSubmit } = useResetRequestOrchestration();
  return (
    <ResetRequestScreen
      errors={errors}
      result={result}
      loading={loading}
      onSubmit={(e) => void onSubmit(e)}
    />
  );
}
