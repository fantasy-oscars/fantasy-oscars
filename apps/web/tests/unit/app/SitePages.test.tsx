import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MantineProvider } from "@ui";
import { MemoryRouter } from "react-router-dom";
import type { ComponentType } from "react";
import { SITE_PAGES, type SitePageKey } from "@/content/sitePages";
import { AboutPage } from "@/app/pages/AboutPage";
import { CodeOfConductPage } from "@/app/pages/CodeOfConductPage";
import { DisclaimerPage } from "@/app/pages/DisclaimerPage";
import { FaqPage } from "@/app/pages/FaqPage";
import { FullSeasonsPage } from "@/app/pages/FullSeasonsPage";
import { HowItWorksPage } from "@/app/pages/HowItWorksPage";
import { PrivacyPage } from "@/app/pages/PrivacyPage";
import { TermsPage } from "@/app/pages/TermsPage";

const fetchSpy = vi.fn();

beforeEach(() => {
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const cases: Array<{
  key: SitePageKey;
  Page: ComponentType;
  title: string;
  section: string;
}> = [
  { key: "about", Page: AboutPage, title: "About", section: "" },
  { key: "faq", Page: FaqPage, title: "FAQ", section: "What is this?" },
  { key: "howItWorks", Page: HowItWorksPage, title: "How It Works", section: "Leagues" },
  {
    key: "fullSeasons",
    Page: FullSeasonsPage,
    title: "Full Awards Seasons",
    section: "Scoring"
  },
  {
    key: "codeOfConduct",
    Page: CodeOfConductPage,
    title: "Code of Conduct",
    section: "Purpose"
  },
  { key: "terms", Page: TermsPage, title: "Terms", section: "Acceptance of Terms" },
  { key: "privacy", Page: PrivacyPage, title: "Privacy", section: "Overview" },
  { key: "disclaimer", Page: DisclaimerPage, title: "Disclaimer", section: "TMDB" }
];

function plainText(node: unknown): string {
  const n = node as { value?: string; children?: unknown[] } | undefined;
  return n?.value ?? (n?.children ?? []).map(plainText).join("");
}

function renderPage(Page: ComponentType) {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <Page />
      </MemoryRouter>
    </MantineProvider>
  );
}

describe("site pages", () => {
  it.each(cases)("$title renders its bundled text without a request", (c) => {
    const { container } = renderPage(c.Page);

    expect(screen.getByRole("heading", { level: 2, name: c.title })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();

    const firstParagraph = SITE_PAGES[c.key].tree.children.find(
      (node) => node.type === "paragraph"
    );
    expect(firstParagraph).toBeTruthy();
    const words = plainText(firstParagraph).split(/\s+/).slice(0, 4).join(" ");
    expect(container.textContent).toContain(words);

    if (c.section) {
      expect(screen.getByRole("heading", { level: 3, name: c.section })).toBeTruthy();
    }
  });

  it("renders How It Works sections below the page title and subsections below them", () => {
    renderPage(HowItWorksPage);
    const section = screen.getByRole("heading", { level: 3, name: "Auto-Drafting" });
    const subsection = screen.getByRole("heading", { level: 4, name: "Alphabetical" });
    expect(screen.getByRole("heading", { level: 4, name: "Negative" })).toBeTruthy();
    // Sections keep the page size and subsections the section size.
    expect(section.getAttribute("data-fo-typo")).toBe("page");
    expect(subsection.getAttribute("data-fo-typo")).toBe("section");
  });

  it("introduces the two kinds of season on How It Works and links to the full seasons page", () => {
    renderPage(HowItWorksPage);
    expect(
      screen.getByRole("heading", { level: 3, name: "Two Kinds of Season" })
    ).toBeTruthy();
    const link = screen.getByRole("link", { name: "Read how full seasons work" });
    expect(link.getAttribute("href")).toBe("/how-it-works/full-seasons");
  });

  it("keeps the owner's heading levels: sections at ##, no level skipped", () => {
    for (const page of Object.values(SITE_PAGES)) {
      const depths = page.tree.children.flatMap((node) =>
        node.type === "heading" ? [node.depth] : []
      );
      if (depths.length === 0) continue;
      expect(depths[0]).toBe(2);
      for (let i = 1; i < depths.length; i += 1) {
        expect(depths[i] - depths[i - 1]).toBeLessThanOrEqual(1);
      }
    }
  });
});
