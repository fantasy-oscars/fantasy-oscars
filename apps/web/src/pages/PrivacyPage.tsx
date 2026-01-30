import { useStaticContentOrchestration } from "../orchestration/content";
import { StaticContentScreen } from "../screens/content/StaticContentScreen";

export function PrivacyPage() {
  const { view } = useStaticContentOrchestration("legal_privacy");
  return <StaticContentScreen fallbackTitle="Privacy" view={view} />;
}
