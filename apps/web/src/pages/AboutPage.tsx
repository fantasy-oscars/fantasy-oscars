import { useStaticContentOrchestration } from "../orchestration/content";
import { AboutScreen } from "../screens/AboutScreen";

export function AboutPage() {
  const { view } = useStaticContentOrchestration("about");
  return <AboutScreen title="About" view={view} />;
}
