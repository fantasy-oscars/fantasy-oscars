import type { Root } from "mdast";
import about from "./about.md?mdast";
import codeOfConduct from "./code-of-conduct.md?mdast";
import disclaimer from "./disclaimer.md?mdast";
import faq from "./faq.md?mdast";
import fullSeasons from "./full-seasons.md?mdast";
import howItWorks from "./how-it-works.md?mdast";
import privacy from "./privacy.md?mdast";
import terms from "./terms.md?mdast";

export type SitePageKey =
  | "about"
  | "faq"
  | "howItWorks"
  | "fullSeasons"
  | "codeOfConduct"
  | "terms"
  | "privacy"
  | "disclaimer";

export type SitePage = { title: string; tree: Root };

/**
 * The site and legal pages, bundled from the markdown files beside this module, parsed at build time.
 * The files keep the owner's levels: sections at `##` render one level below the
 * page title (h3) and take the largest Markdown heading size.
 */
export const SITE_PAGES: Record<SitePageKey, SitePage> = {
  about: { title: "About", tree: about },
  faq: { title: "FAQ", tree: faq },
  howItWorks: { title: "How It Works", tree: howItWorks },
  fullSeasons: { title: "Full Awards Seasons", tree: fullSeasons },
  codeOfConduct: { title: "Code of Conduct", tree: codeOfConduct },
  terms: { title: "Terms", tree: terms },
  privacy: { title: "Privacy", tree: privacy },
  disclaimer: { title: "Disclaimer", tree: disclaimer }
};
