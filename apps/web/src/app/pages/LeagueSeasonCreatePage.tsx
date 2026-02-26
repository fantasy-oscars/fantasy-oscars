import { useNavigate, useParams } from "react-router-dom";
import { useEffect } from "react";
import { useLeagueSeasonCreateOrchestration } from "@/orchestration/seasons";
import { LeagueSeasonCreateScreen } from "@/features/seasons/screens/LeagueSeasonCreateScreen";
import { leagueSeasonCreatePath, seasonPath } from "@/lib/routes";

export function LeagueSeasonCreatePage() {
  const { id, leagueId: leagueIdRaw } = useParams();
  const leagueId = Number(leagueIdRaw ?? id);
  const isLegacyLeagueRoute = Boolean(id && !leagueIdRaw);
  const navigate = useNavigate();
  const orchestrator = useLeagueSeasonCreateOrchestration({ leagueId });

  useEffect(() => {
    if (!isLegacyLeagueRoute) return;
    if (orchestrator.view.state !== "ready") return;
    navigate(
      leagueSeasonCreatePath({
        leagueId,
        leagueName: orchestrator.view.league.name
      }),
      { replace: true }
    );
  }, [isLegacyLeagueRoute, leagueId, navigate, orchestrator.view]);

  async function submitAndRedirect() {
    const res = await orchestrator.actions.submit();
    if (res.ok && "seasonId" in res && res.seasonId) {
      const readyView = orchestrator.view.state === "ready" ? orchestrator.view : null;
      const leagueName = readyView?.league.name ?? "";
      const ceremonyCode =
        readyView?.ceremonies.find((c) => c.id === readyView.ceremonyId)?.code ?? null;
      navigate(
        seasonPath({
          leagueId,
          leagueName,
          ceremonyCode,
          ceremonyId: readyView?.ceremonyId ?? null
        }),
        { replace: true }
      );
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
        setTimerEnabled: orchestrator.actions.setTimerEnabled,
        setPickTimerSeconds: orchestrator.actions.setPickTimerSeconds,
        reset: orchestrator.actions.reset,
        submit: () => void submitAndRedirect()
      }}
    />
  );
}
