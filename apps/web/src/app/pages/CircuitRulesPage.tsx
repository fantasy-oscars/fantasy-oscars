import { useParams } from "react-router-dom";
import { useCircuitRulesOrchestration } from "@/orchestration/circuitRules";
import { CircuitRulesScreen } from "@/features/circuitLeagues/screens/CircuitRulesScreen";

export function CircuitRulesPage() {
  const { fullSeasonId: circuitLeagueId } = useParams();
  const o = useCircuitRulesOrchestration({ circuitLeagueId: Number(circuitLeagueId) });
  return <CircuitRulesScreen view={o.view} />;
}
