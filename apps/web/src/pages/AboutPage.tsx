import { useStaticContentOrchestration } from "../orchestration/content";
import { StaticContentScreen } from "../screens/content/StaticContentScreen";

export function AboutPage() {
  const { view } = useStaticContentOrchestration("about");
  return <StaticContentScreen fallbackTitle="About" view={view} />;
}
