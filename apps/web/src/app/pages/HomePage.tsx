import { useAuthContext } from "@/auth/context";
import { LandingScreen } from "@/features/home/screens/LandingScreen";
import { useLandingOrchestration } from "@/orchestration/landing";

export function HomePage() {
  const { user, loading } = useAuthContext();
  const { view } = useLandingOrchestration({ seasonsEnabled: Boolean(user) });

  return <LandingScreen user={user} authLoading={loading} view={view} />;
}
