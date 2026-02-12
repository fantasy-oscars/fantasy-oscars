import { useLeagueIndexOrchestration } from "@/orchestration/leagueIndex";
import { LeagueIndexScreen } from "@/screens/LeagueIndexScreen";

export function LeaguesPage() {
  const { view } = useLeagueIndexOrchestration();
  return <LeagueIndexScreen view={view} />;
}
