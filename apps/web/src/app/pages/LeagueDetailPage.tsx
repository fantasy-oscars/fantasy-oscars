import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuthContext } from "@/auth/context";
import { useLeagueDetailOrchestration } from "@/orchestration/leagues";
import { LeagueDetailScreen } from "@/features/leagues/screens/LeagueDetailScreen";
import { circuitLeaguePath, leaguePath } from "@/lib/routes";

export function LeagueDetailPage() {
  const { id, leagueId: leagueIdRaw } = useParams();
  const leagueId = Number(leagueIdRaw ?? id);
  const isLegacyLeagueRoute = Boolean(id && !leagueIdRaw);
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const league = useLeagueDetailOrchestration({ leagueId, userSub: user?.sub });

  useEffect(() => {
    if (!isLegacyLeagueRoute) return;
    if (league.view.state !== "ready") return;
    navigate(
      leaguePath({
        leagueId: league.view.league.id,
        leagueName: league.view.league.name
      }),
      { replace: true }
    );
  }, [isLegacyLeagueRoute, league.view, navigate]);

  return (
    <LeagueDetailScreen
      user={user}
      leagueId={leagueId}
      view={league.view}
      working={league.working}
      rosterStatus={league.rosterStatus}
      onTransferOwnershipTo={league.transferOwnershipTo}
      startingCircuit={league.startingCircuit}
      circuitStatus={league.circuitStatus}
      onStartCircuit={async (circuitId) => {
        const res = await league.startCircuit(circuitId);
        if (res.ok && league.view.state === "ready") {
          navigate(
            circuitLeaguePath({
              leagueId: league.view.league.id,
              leagueName: league.view.league.name,
              circuitLeagueId: res.circuitLeagueId
            })
          );
        }
      }}
      onDeleteLeague={async () => {
        const res = await league.deleteLeague();
        if (res.ok) navigate("/leagues");
        return res;
      }}
    />
  );
}
