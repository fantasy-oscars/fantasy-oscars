import { useParams } from "react-router-dom";
import { useContenderPickerOrchestration } from "@/orchestration/contenders";
import { ContenderPickerPreviewScreen } from "@/features/contenders/screens/ContenderPickerPreviewScreen";

export function AdminCircuitPickerPage() {
  const { circuitId: circuitIdRaw } = useParams();
  const parsed = circuitIdRaw ? Number(circuitIdRaw) : NaN;
  const circuitId = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  const o = useContenderPickerOrchestration({ circuitId });
  return <ContenderPickerPreviewScreen {...o} />;
}
