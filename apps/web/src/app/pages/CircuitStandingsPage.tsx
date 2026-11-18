import { useParams } from "react-router-dom";
import { useAuthContext } from "@/auth/context";
import { useCircuitStandingsOrchestration } from "@/orchestration/circuitStandings";
import { CircuitStandingsScreen } from "@/features/circuitLeagues/screens/CircuitStandingsScreen";

function positiveInt(raw: string | null | undefined): number | null {
  const n = raw ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function CircuitStandingsPage() {
  const { fullSeasonId: circuitLeagueId } = useParams();
  const { user } = useAuthContext();
  const o = useCircuitStandingsOrchestration({
    circuitLeagueId: Number(circuitLeagueId)
  });
  return <CircuitStandingsScreen view={o.view} viewerUserId={positiveInt(user?.sub)} />;
}
