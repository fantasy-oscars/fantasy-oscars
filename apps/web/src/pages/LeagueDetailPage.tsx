import { useParams } from "react-router-dom";
import { useAuthContext } from "../auth/context";
import { useLeagueDetailOrchestration } from "../orchestration/leagues";
import { LeagueDetailScreen } from "../screens/leagues/LeagueDetailScreen";

export function LeagueDetailPage() {
  const { id } = useParams();
  const leagueId = Number(id);
  const { user } = useAuthContext();
  const league = useLeagueDetailOrchestration({ leagueId, userSub: user?.sub });

  return (
    <LeagueDetailScreen
      user={user}
      leagueId={leagueId}
      view={league.view}
      working={league.working}
      rosterStatus={league.rosterStatus}
      transferTarget={league.transferTarget}
      setTransferTarget={league.setTransferTarget}
      onCopyInvite={league.copyInvite}
      onTransferOwnership={league.transferOwnership}
      onRemoveMember={league.removeMember}
    />
  );
}
