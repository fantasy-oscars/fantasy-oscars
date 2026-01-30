import { StaticPage } from "../ui/StaticPage";
import { useStaticContent } from "../features/content/useStaticContent";
import { PageError, PageLoader } from "../ui/page-state";
import { Markdown } from "../ui/Markdown";

export function TermsPage() {
  const { view } = useStaticContent("legal_terms");

  if (view.state === "loading") {
    return (
      <StaticPage title="Terms">
        <PageLoader label="Loading..." />
      </StaticPage>
    );
  }
  if (view.state === "error") {
    return (
      <StaticPage title="Terms">
        <PageError message={view.message} />
      </StaticPage>
    );
  }

  return (
    <StaticPage title={view.content.title || "Terms"}>
      <Markdown markdown={view.content.body_markdown} />
    </StaticPage>
  );
}
