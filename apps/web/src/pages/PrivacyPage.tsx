import { StaticPage } from "../ui/StaticPage";
import { useStaticContent } from "../features/content/useStaticContent";
import { PageError, PageLoader } from "../ui/page-state";
import { Markdown } from "../ui/Markdown";

export function PrivacyPage() {
  const { view } = useStaticContent("legal_privacy");

  if (view.state === "loading") {
    return (
      <StaticPage title="Privacy">
        <PageLoader label="Loading..." />
      </StaticPage>
    );
  }
  if (view.state === "error") {
    return (
      <StaticPage title="Privacy">
        <PageError message={view.message} />
      </StaticPage>
    );
  }

  return (
    <StaticPage title={view.content.title || "Privacy"}>
      <Markdown markdown={view.content.body_markdown} />
    </StaticPage>
  );
}
