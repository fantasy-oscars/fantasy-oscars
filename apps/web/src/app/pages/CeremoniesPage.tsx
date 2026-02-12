import { useCeremoniesIndexOrchestration } from "@/orchestration/ceremonies";
import { CeremoniesIndexScreen } from "@/screens/ceremonies/CeremoniesIndexScreen";

export function CeremoniesPage() {
  const o = useCeremoniesIndexOrchestration();
  return (
    <CeremoniesIndexScreen
      state={o.state}
      error={o.error}
      active={o.active}
      archived={o.archived}
    />
  );
}
