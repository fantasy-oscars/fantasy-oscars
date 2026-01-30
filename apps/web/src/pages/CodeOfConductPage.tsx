import { useStaticContentOrchestration } from "../orchestration/content";
import { StaticContentScreen } from "../screens/content/StaticContentScreen";

export function CodeOfConductPage() {
  const { view } = useStaticContentOrchestration("code_of_conduct");
  return <StaticContentScreen fallbackTitle="Code of Conduct" view={view} />;
}
