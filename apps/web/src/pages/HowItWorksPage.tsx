import { useStaticContentOrchestration } from "../orchestration/content";
import { StaticContentScreen } from "../screens/content/StaticContentScreen";

export function HowItWorksPage() {
  const { view } = useStaticContentOrchestration("how_it_works");
  return <StaticContentScreen fallbackTitle="How It Works" view={view} />;
}
