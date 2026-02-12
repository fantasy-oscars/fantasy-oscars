import { useStaticContentOrchestration } from "@/orchestration/content";
import { StaticContentScreen } from "@/screens/content/StaticContentScreen";

export function DisclaimerPage() {
  const { view } = useStaticContentOrchestration("legal_disclaimer");
  return <StaticContentScreen fallbackTitle="Disclaimer" view={view} />;
}
