import { useAuthContext } from "../auth/context";
import { useHomeOrchestration } from "../orchestration/home";
import { HomeScreen } from "../screens/HomeScreen";

export function HomePage() {
  const { user, loading } = useAuthContext();
  const { view } = useHomeOrchestration({ seasonsEnabled: Boolean(user) });

  return <HomeScreen user={user} authLoading={loading} view={view} />;
}
