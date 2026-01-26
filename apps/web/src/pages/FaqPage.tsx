import { StaticPage } from "../ui/StaticPage";
import { useStaticContent } from "../features/content/useStaticContent";
import { PageError, PageLoader } from "../ui/page-state";
import { Markdown } from "../ui/Markdown";

export function FaqPage() {
  const { view } = useStaticContent("faq");

  if (view.state === "loading") {
    return (
      <StaticPage title="FAQ">
        <PageLoader label="Loading..." />
      </StaticPage>
    );
  }
  if (view.state === "error") {
    return (
      <StaticPage title="FAQ">
        <PageError message={view.message} />
      </StaticPage>
    );
  }

  return (
    <StaticPage title={view.content.title || "FAQ"}>
      <Markdown markdown={view.content.body_markdown} />
    </StaticPage>
  );
}
