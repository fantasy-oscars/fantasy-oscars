import { useParams } from "react-router-dom";
import { useCircuitTransactionsOrchestration } from "@/orchestration/circuitRoster";
import { CircuitTransactionsScreen } from "@/features/circuitLeagues/screens/CircuitTransactionsScreen";

export function CircuitTransactionsPage() {
  const { fullSeasonId: circuitLeagueId } = useParams();
  const o = useCircuitTransactionsOrchestration({
    circuitLeagueId: Number(circuitLeagueId)
  });
  return <CircuitTransactionsScreen view={o.view} />;
}
