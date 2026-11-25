import { useParams } from "react-router-dom";
import { useCircuitLeagueOrchestration } from "@/orchestration/circuitLeague";
import { CircuitLeagueScreen } from "@/features/circuitLeagues/screens/CircuitLeagueScreen";

export function CircuitLeaguePage() {
  const { fullSeasonId: circuitLeagueId } = useParams();
  const o = useCircuitLeagueOrchestration({ circuitLeagueId: Number(circuitLeagueId) });

  return (
    <CircuitLeagueScreen
      view={o.view}
      addDrop={o.addDrop}
      passPicks={o.passPicks}
      acting={o.acting}
      memberStatus={o.memberStatus}
      lockStatus={o.lockStatus}
      onSaveArea={o.saveArea}
      onJoin={() => void o.join()}
      onLeave={() => void o.leave()}
      onInitialize={() => void o.initialize()}
    />
  );
}
