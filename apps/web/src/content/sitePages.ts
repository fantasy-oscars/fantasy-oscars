import about from "./about.md?raw";
import codeOfConduct from "./code-of-conduct.md?raw";
import disclaimer from "./disclaimer.md?raw";
import faq from "./faq.md?raw";
import howItWorks from "./how-it-works.md?raw";
import privacy from "./privacy.md?raw";
import terms from "./terms.md?raw";

export type SitePageKey =
  "about" | "faq" | "howItWorks" | "codeOfConduct" | "terms" | "privacy" | "disclaimer";

export type SitePage = { title: string; markdown: string };

/**
 * The site and legal pages, bundled from the markdown files beside this module.
 * The files keep the owner's levels: sections at `##` render one level below the
 * page title (h3) and take the largest Markdown heading size.
 */
export const SITE_PAGES: Record<SitePageKey, SitePage> = {
  about: { title: "About", markdown: about },
  faq: { title: "FAQ", markdown: faq },
  howItWorks: { title: "How It Works", markdown: howItWorks },
  codeOfConduct: { title: "Code of Conduct", markdown: codeOfConduct },
  terms: { title: "Terms", markdown: terms },
  privacy: { title: "Privacy", markdown: privacy },
  disclaimer: { title: "Disclaimer", markdown: disclaimer }
};
