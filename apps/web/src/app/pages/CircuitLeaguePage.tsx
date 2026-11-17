import { useParams } from "react-router-dom";
import { useCircuitLeagueOrchestration } from "@/orchestration/circuitLeague";
import { CircuitLeagueScreen } from "@/features/circuitLeagues/screens/CircuitLeagueScreen";

export function CircuitLeaguePage() {
  const { circuitLeagueId } = useParams();
  const o = useCircuitLeagueOrchestration({ circuitLeagueId: Number(circuitLeagueId) });

  return (
    <CircuitLeagueScreen
      view={o.view}
      saving={o.saving}
      acting={o.acting}
      settingsStatus={o.settingsStatus}
      memberStatus={o.memberStatus}
      lockStatus={o.lockStatus}
      onChange={o.updateForm}
      onSave={() => void o.save()}
      onReset={o.resetForm}
      onJoin={() => void o.join()}
      onLeave={() => void o.leave()}
      onInitialize={() => void o.initialize()}
    />
  );
}
