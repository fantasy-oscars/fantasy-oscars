import { useSeasonsIndexBaselineOrchestration } from "../orchestration/seasonsIndexBaseline";
import { SeasonsIndexScreen } from "../screens/seasons/SeasonsIndexScreen";

export function SeasonsIndexPage() {
  const { view } = useSeasonsIndexBaselineOrchestration();
  return <SeasonsIndexScreen view={view} />;
}
