import { useParams } from "react-router-dom";
import { useCeremonyDetailOrchestration } from "../orchestration/ceremonies";
import { DraftPlansScreen } from "../screens/ceremonies/DraftPlansScreen";
import { useDraftPlansOrchestration } from "../orchestration/draftPlans";

export function DraftPlansPage() {
  const { id: idRaw } = useParams();
  const idParsed = idRaw ? Number(idRaw) : NaN;
  const ceremonyId = Number.isFinite(idParsed) && idParsed > 0 ? idParsed : null;

  const o = useCeremonyDetailOrchestration({ ceremonyId });
  const plans = useDraftPlansOrchestration({ ceremonyId });
  return (
    <DraftPlansScreen
      ceremonyState={o.state}
      ceremonyError={o.error}
      detail={o.detail}
      plans={plans}
    />
  );
}
