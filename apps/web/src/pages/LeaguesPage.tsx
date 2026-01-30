import { useLeaguesIndexOrchestration } from "../orchestration/leagues";
import { LeaguesIndexScreen } from "../screens/leagues/LeaguesIndexScreen";

export function LeaguesPage() {
  const { view } = useLeaguesIndexOrchestration();
  return <LeaguesIndexScreen view={view} />;
}
