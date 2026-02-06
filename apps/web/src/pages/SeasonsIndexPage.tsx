import { useSeasonsIndexBaselineOrchestration } from "../orchestration/seasonsIndexBaseline";
import { SeasonsIndexBaselineScreen } from "../screens/SeasonsIndexBaselineScreen";

export function SeasonsIndexPage() {
  const { view } = useSeasonsIndexBaselineOrchestration();
  return <SeasonsIndexBaselineScreen view={view} />;
}
