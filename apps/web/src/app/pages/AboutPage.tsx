import { SITE_PAGES } from "@/content/sitePages";
import { AboutScreen } from "@/features/content/screens/AboutScreen";

export function AboutPage() {
  return <AboutScreen page={SITE_PAGES.about} />;
}
