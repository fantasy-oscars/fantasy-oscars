import { useStaticContentOrchestration } from "../orchestration/content";
import { StaticContentScreen } from "../screens/content/StaticContentScreen";

export function FaqPage() {
  const { view } = useStaticContentOrchestration("faq");
  return <StaticContentScreen fallbackTitle="FAQ" view={view} />;
}
