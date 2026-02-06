import { useCeremoniesIndexOrchestration } from "../orchestration/ceremonies";
import { CeremoniesIndexBaselineScreen } from "../screens/CeremoniesIndexBaselineScreen";

export function CeremoniesPage() {
  const o = useCeremoniesIndexOrchestration();
  return (
    <CeremoniesIndexBaselineScreen
      state={o.state}
      error={o.error}
      active={o.active}
      archived={o.archived}
    />
  );
}
