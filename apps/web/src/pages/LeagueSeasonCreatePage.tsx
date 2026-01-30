import { useNavigate, useParams } from "react-router-dom";
import { useLeagueSeasonCreateOrchestration } from "../orchestration/seasons";
import { LeagueSeasonCreateScreen } from "../screens/seasons/LeagueSeasonCreateScreen";

export function LeagueSeasonCreatePage() {
  const { id } = useParams();
  const leagueId = Number(id);
  const navigate = useNavigate();
  const orchestrator = useLeagueSeasonCreateOrchestration({ leagueId });

  async function submitAndRedirect() {
    const res = await orchestrator.actions.submit();
    if (res.ok && "seasonId" in res && res.seasonId) {
      navigate(`/seasons/${res.seasonId}`, { replace: true });
    }
  }

  return (
    <LeagueSeasonCreateScreen
      leagueId={leagueId}
      view={orchestrator.view}
      actions={{
        setCeremonyId: orchestrator.actions.setCeremonyId,
        setScoringStrategy: orchestrator.actions.setScoringStrategy,
        setRemainderStrategy: orchestrator.actions.setRemainderStrategy,
        reset: orchestrator.actions.reset,
        submit: () => void submitAndRedirect()
      }}
    />
  );
}
