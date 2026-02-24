import { useStaticContentOrchestration } from "@/orchestration/content";
import { StaticContentScreen } from "@/features/content/screens/StaticContentScreen";

export function DisclaimerPage() {
  const { view } = useStaticContentOrchestration("legal_disclaimer");
  return <StaticContentScreen fallbackTitle="Disclaimer" view={view} />;
}
