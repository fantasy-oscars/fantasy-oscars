import { SITE_PAGES } from "@/content/sitePages";
import { StaticContentScreen } from "@/features/content/screens/StaticContentScreen";

export function FaqPage() {
  return <StaticContentScreen page={SITE_PAGES.faq} />;
}
