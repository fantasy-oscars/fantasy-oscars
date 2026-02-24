import { useStaticContentOrchestration } from "@/orchestration/content";
import { StaticContentScreen } from "@/features/content/screens/StaticContentScreen";

export function TermsPage() {
  const { view } = useStaticContentOrchestration("legal_terms");
  return <StaticContentScreen fallbackTitle="Terms" view={view} />;
}
