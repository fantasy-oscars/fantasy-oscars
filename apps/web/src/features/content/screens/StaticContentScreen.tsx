import type { SitePage } from "@/content/sitePages";
import { Markdown } from "@ui/Markdown";
import { StaticPage } from "@/shared/StaticPage";

export function StaticContentScreen(props: { page: SitePage }) {
  const { page } = props;
  return (
    <StaticPage title={page.title}>
      <Markdown markdown={page.markdown} />
    </StaticPage>
  );
}
