import { useStaticContentOrchestration } from "@/orchestration/content";
import { StaticContentScreen } from "@/features/content/screens/StaticContentScreen";

export function FaqPage() {
  const { view } = useStaticContentOrchestration("faq");
  return <StaticContentScreen fallbackTitle="FAQ" view={view} />;
}
