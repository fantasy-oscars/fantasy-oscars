import { useParams } from "react-router-dom";
import { useCeremonyDetailOrchestration } from "@/orchestration/ceremonies";
import { CeremonyDetailScreen } from "@/screens/ceremonies/CeremonyDetailScreen";

export function CeremonyPage() {
  const { id: idRaw } = useParams();
  const idParsed = idRaw ? Number(idRaw) : NaN;
  const ceremonyId = Number.isFinite(idParsed) && idParsed > 0 ? idParsed : null;

  const o = useCeremonyDetailOrchestration({ ceremonyId });
  return <CeremonyDetailScreen state={o.state} error={o.error} detail={o.detail} />;
}
