import { useStaticContentOrchestration } from "@/orchestration/content";
import { StaticContentScreen } from "@/features/content/screens/StaticContentScreen";

export function PrivacyPage() {
  const { view } = useStaticContentOrchestration("legal_privacy");
  return <StaticContentScreen fallbackTitle="Privacy" view={view} />;
}
