import { StaticPage } from "../ui/StaticPage";
import { useStaticContent } from "../features/content/useStaticContent";
import { PageError, PageLoader } from "../ui/page-state";
import { Markdown } from "../ui/Markdown";

export function CodeOfConductPage() {
  const { view } = useStaticContent("code_of_conduct");

  if (view.state === "loading") {
    return (
      <StaticPage title="Code of Conduct">
        <PageLoader label="Loading..." />
      </StaticPage>
    );
  }
  if (view.state === "error") {
    return (
      <StaticPage title="Code of Conduct">
        <PageError message={view.message} />
      </StaticPage>
    );
  }

  return (
    <StaticPage title={view.content.title || "Code of Conduct"}>
      <Markdown markdown={view.content.body_markdown} />
    </StaticPage>
  );
}
