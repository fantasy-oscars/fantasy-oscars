import { useLeagueIndexOrchestration } from "@/orchestration/leagueIndex";
import { LeagueIndexScreen } from "@/features/leagues/screens/LeagueIndexScreen";

export function LeaguesPage() {
  const { view } = useLeagueIndexOrchestration();
  return <LeagueIndexScreen view={view} />;
}
