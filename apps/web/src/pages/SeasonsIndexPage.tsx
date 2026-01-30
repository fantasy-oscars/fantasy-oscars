import { useSeasonsIndexOrchestration } from "../orchestration/seasons";
import { SeasonsIndexScreen } from "../screens/seasons/SeasonsIndexScreen";

export function SeasonsIndexPage() {
  const { view } = useSeasonsIndexOrchestration();
  return <SeasonsIndexScreen view={view} />;
}
