import { useSeasonsIndexOrchestration } from "@/orchestration/seasonsIndex";
import { SeasonsIndexScreen } from "@/features/seasons/screens/SeasonsIndexScreen";

export function SeasonsIndexPage() {
  const { view } = useSeasonsIndexOrchestration();
  return <SeasonsIndexScreen view={view} />;
}
