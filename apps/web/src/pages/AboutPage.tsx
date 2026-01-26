import { StaticPage } from "../ui/StaticPage";
import { useStaticContent } from "../features/content/useStaticContent";
import { PageError, PageLoader } from "../ui/page-state";
import { Markdown } from "../ui/Markdown";

export function AboutPage() {
  const { view } = useStaticContent("about");

  if (view.state === "loading") {
    return (
      <StaticPage title="About">
        <PageLoader label="Loading..." />
      </StaticPage>
    );
  }
  if (view.state === "error") {
    return (
      <StaticPage title="About">
        <PageError message={view.message} />
      </StaticPage>
    );
  }

  return (
    <StaticPage title={view.content.title || "About"}>
      <Markdown markdown={view.content.body_markdown} />
    </StaticPage>
  );
}
