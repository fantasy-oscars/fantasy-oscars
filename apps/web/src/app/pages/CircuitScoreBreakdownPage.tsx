import { useParams } from "react-router-dom";
import { useAuthContext } from "@/auth/context";
import { useCircuitCeremonyBreakdownOrchestration } from "@/orchestration/circuitStandings";
import { CircuitScoreBreakdownScreen } from "@/features/circuitLeagues/screens/CircuitScoreBreakdownScreen";

function positiveInt(raw: string | null | undefined): number | null {
  const n = raw ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function CircuitScoreBreakdownPage() {
  const { fullSeasonId: circuitLeagueId, ceremonyId } = useParams();
  const { user } = useAuthContext();
  const o = useCircuitCeremonyBreakdownOrchestration({
    circuitLeagueId: Number(circuitLeagueId),
    ceremonyId: Number(ceremonyId)
  });
  return (
    <CircuitScoreBreakdownScreen view={o.view} viewerUserId={positiveInt(user?.sub)} />
  );
}
