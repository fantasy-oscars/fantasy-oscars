import { useStaticContentOrchestration } from "@/orchestration/content";
import { AboutScreen } from "@/features/content/screens/AboutScreen";

export function AboutPage() {
  const { view } = useStaticContentOrchestration("about");
  return <AboutScreen title="About" view={view} />;
}
