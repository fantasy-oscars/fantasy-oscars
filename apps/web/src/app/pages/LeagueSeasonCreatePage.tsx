import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useCallback, useEffect } from "react";
import { useAuthContext } from "@/auth/context";
import { hasSuperAdminAccess } from "@/auth/roles";
import { useLeagueSeasonCreateOrchestration } from "@/orchestration/seasons";
import { LeagueSeasonCreateScreen } from "@/features/seasons/screens/LeagueSeasonCreateScreen";
import { parseSeasonKind, type SeasonKind } from "@/decisions/seasonKinds";
import { circuitLeaguePath, leagueSeasonCreatePath, seasonPath } from "@/lib/routes";

export function LeagueSeasonCreatePage() {
  const { id, leagueId: leagueIdRaw } = useParams();
  const leagueId = Number(leagueIdRaw ?? id);
  const isLegacyLeagueRoute = Boolean(id && !leagueIdRaw);
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const { user } = useAuthContext();
  const orchestrator = useLeagueSeasonCreateOrchestration({
    leagueId,
    userSub: user?.sub,
    fullSeasonEnabled: hasSuperAdminAccess(user)
  });

  // The chosen kind lives in the URL, replaced in place, so reload and Back keep it.
  const chooseKind = useCallback(
    (kind: SeasonKind) =>
      setSearch(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("kind", kind);
          return next;
        },
        { replace: true }
      ),
    [setSearch]
  );

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

  async function submitFullAndRedirect() {
    const res = await orchestrator.actions.submitFull();
    if (res.ok) {
      const leagueName =
        orchestrator.view.state === "ready" ? orchestrator.view.league.name : "";
      navigate(
        circuitLeaguePath({ leagueId, leagueName, circuitLeagueId: res.fullSeasonId }),
        { replace: true }
      );
    }
  }

  return (
    <LeagueSeasonCreateScreen
      leagueId={leagueId}
      view={orchestrator.view}
      requestedKind={parseSeasonKind(search.get("kind"))}
      actions={{
        chooseKind,
        retryFull: () => void orchestrator.actions.retryFull(),
        setFullCircuitId: orchestrator.actions.setFullCircuitId,
        resetFull: orchestrator.actions.resetFull,
        submitFull: () => void submitFullAndRedirect(),
        retryFullOptions: orchestrator.actions.retryFullOptions,
        applyFullArea: orchestrator.actions.applyFullArea,
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
