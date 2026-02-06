import { useNavigate, useParams } from "react-router-dom";
import { useAuthContext } from "../auth/context";
import { useLeagueDetailOrchestration } from "../orchestration/leagues";
import { LeagueDetailScreen } from "../screens/leagues/LeagueDetailScreen";

export function LeagueDetailPage() {
  const { id } = useParams();
  const leagueId = Number(id);
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const league = useLeagueDetailOrchestration({ leagueId, userSub: user?.sub });

  return (
    <LeagueDetailScreen
      user={user}
      leagueId={leagueId}
      view={league.view}
      working={league.working}
      rosterStatus={league.rosterStatus}
      onTransferOwnershipTo={league.transferOwnershipTo}
      onDeleteLeague={async () => {
        const res = await league.deleteLeague();
        if (res.ok) navigate("/leagues");
        return res;
      }}
    />
  );
}
