import type { StaticContentView } from "@/orchestration/content";
import { Markdown } from "@ui/Markdown";
import { PageError } from "@/shared/page-state";
import { StaticPage, StaticPageProseSkeleton } from "@/shared/StaticPage";

export function StaticContentScreen(props: {
  fallbackTitle: string;
  view: StaticContentView;
}) {
  const { fallbackTitle, view } = props;

  if (view.state === "loading") {
    return (
      <StaticPage title={fallbackTitle}>
        <StaticPageProseSkeleton />
      </StaticPage>
    );
  }
  if (view.state === "error") {
    return (
      <StaticPage title={fallbackTitle}>
        <PageError message={view.message} />
      </StaticPage>
    );
  }

  return (
    <StaticPage title={view.content.title || fallbackTitle}>
      <Markdown markdown={view.content.body_markdown} />
    </StaticPage>
  );
}
