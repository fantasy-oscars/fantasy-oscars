import { useSeasonsIndexOrchestration } from "../orchestration/seasonsIndex";
import { SeasonsIndexScreen } from "../screens/seasons/SeasonsIndexScreen";

export function SeasonsIndexPage() {
  const { view } = useSeasonsIndexOrchestration();
  return <SeasonsIndexScreen view={view} />;
}
