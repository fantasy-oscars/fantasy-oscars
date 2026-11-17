import fs from "node:fs";
import path from "node:path";
import { cleanup, render, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { parseMarkdown } from "@fantasy-oscars/shared/markdown";
import { MantineProvider } from "@ui";
import { LandingScreen } from "@/features/home/screens/LandingScreen";
import { HERO_TAGLINE } from "@/decisions/landing";

afterEach(cleanup);

const BASELINE_CSS = fs.readFileSync(
  path.resolve(__dirname, "../../../src/primitives/baseline.css"),
  "utf8"
);

/** Declarations of the first top-level rule with exactly this selector. */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, "m").exec(BASELINE_CSS);
  if (!m) throw new Error(`no rule for ${selector}`);
  return m[1]!;
}

function renderHome() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <LandingScreen
          user={null}
          authLoading={false}
          view={{
            updates: {
              state: "ready",
              content: {
                id: 1,
                key: "home_main",
                title: "Thank you for playing",
                body_markdown: "See you next year.",
                body_tree: parseMarkdown("See you next year."),
                published_at: "2026-01-31T00:00:00Z"
              }
            },
            seasons: { state: "idle" }
          }}
          refresh={{ updates: async () => {}, seasons: async () => {} }}
        />
      </MemoryRouter>
    </MantineProvider>
  );
}

describe("Home create-league slots", () => {
  it("renders the card in the hero after the tagline and in the side column", () => {
    const { container } = renderHome();
    const slots = [...container.querySelectorAll<HTMLElement>(".baseline-ctaSlot")];
    expect(slots.map((s) => s.dataset.slot)).toEqual(["hero", "aside"]);

    const hero = container.querySelector(".baseline-heroCard") as HTMLElement;
    const heroSlot = slots[0]!;
    expect(hero.contains(heroSlot)).toBe(true);
    const tagline = within(hero).getByText(HERO_TAGLINE);
    expect(
      tagline.compareDocumentPosition(heroSlot) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    const aside = container.querySelector(".baseline-landing-aside") as HTMLElement;
    expect(aside.contains(slots[1]!)).toBe(true);
    for (const slot of slots) {
      within(slot).getByRole("heading", { level: 3, name: "Create a league" });
      within(slot).getByRole("link", { name: "New league" });
    }
  });

  it("orders the hero card before the update, and the update before the seasons", () => {
    const { container } = renderHome();
    const order = [
      container.querySelector(".baseline-heroText"),
      container.querySelector('.baseline-ctaSlot[data-slot="hero"]'),
      container.querySelector(".baseline-updatesCard"),
      container.querySelector('.baseline-ctaSlot[data-slot="aside"]'),
      container.querySelector(".baseline-asideHeading")
    ];
    for (let i = 1; i < order.length; i++) {
      expect(
        order[i - 1]!.compareDocumentPosition(order[i]!) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }
  });

  it("keeps the seasons heading an h3, styled from the brand's aside heading", () => {
    const { container } = renderHome();
    const aside = container.querySelector(".baseline-landing-aside") as HTMLElement;
    const heading = within(aside).getByRole("heading", { name: "Active seasons" });
    expect(heading.tagName).toBe("H3");
    expect(heading).toHaveClass("baseline-asideHeading");
  });
});

describe("Home signature styles", () => {
  it("shows each create-league slot from its derived display property", () => {
    expect(ruleBody('.baseline-ctaSlot[data-slot="hero"]')).toContain(
      "display: var(--brand-home-cta-hero-display);"
    );
    expect(ruleBody('.baseline-ctaSlot[data-slot="aside"]')).toContain(
      "display: var(--brand-home-cta-aside-display);"
    );
  });

  it("outlines the hero card in the hero's inks, with a hero-local focus ring", () => {
    const body = ruleBody(".baseline-landing .baseline-heroCard .baseline-actionCard");
    expect(body).toContain("border: 1px solid var(--brand-home-cta-hero-edge);");
    expect(body).toContain("background: transparent;");
    expect(body).toContain("--brand-focus-ring: var(--brand-home-hero-fg);");
  });

  it("rules the update from the brand's update rule", () => {
    const body = ruleBody(".baseline-landing .baseline-updatesCard");
    expect(body).toContain("border-top: var(--brand-home-update-rule);");
    expect(body).toMatch(/padding-top:[^;]*var\(--brand-home-update-ruled\)/);
    expect(body).toMatch(/border-radius:[^;]*var\(--brand-home-update-ruled\)/);
  });

  it("starts a band hero at the top of the grid", () => {
    expect(ruleBody(".baseline-landing-grid")).toMatch(
      /padding:[^;]*var\(--brand-home-hero-band\)/
    );
  });

  it("gives the hero wordmark the brand's hero tone style", () => {
    expect(ruleBody(".baseline-heroCard")).toContain(
      "--brand-wordmark-tone-style: var(--brand-home-hero-tone-style);"
    );
  });

  it("styles the seasons heading from the aside heading properties", () => {
    const body = ruleBody(".baseline-landing .mantine-Title-root.baseline-asideHeading");
    for (const prop of [
      "font-family: var(--brand-home-aside-heading-font);",
      "font-weight: var(--brand-home-aside-heading-weight);",
      "text-transform: var(--brand-home-aside-heading-case);",
      "letter-spacing: var(--brand-home-aside-heading-tracking);",
      "font-size: var(--brand-home-aside-heading-size);",
      "color: var(--brand-home-aside-heading-color);"
    ]) {
      expect(body).toContain(prop);
    }
  });

  it("draws the grease-pencil ring as an accent felt-tip stroke, not an ellipse border", () => {
    const body = ruleBody(".baseline-ctaMark::before");
    expect(body).toContain("background-color: var(--brand-accent);");
    expect(body).toMatch(/mask: url\("data:image\/svg\+xml,[^"]*%3Cpath d='M[^']+'/);
    expect(body).toContain("opacity: var(--brand-deco-grease-pencil);");
    expect(body).toContain("pointer-events: none;");
    expect(body).not.toMatch(/border(-radius)?:/);
  });
});
