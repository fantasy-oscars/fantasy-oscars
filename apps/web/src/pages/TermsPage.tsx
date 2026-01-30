import { useStaticContentOrchestration } from "../orchestration/content";
import { StaticContentScreen } from "../screens/content/StaticContentScreen";

export function TermsPage() {
  const { view } = useStaticContentOrchestration("legal_terms");
  return <StaticContentScreen fallbackTitle="Terms" view={view} />;
}
