import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { MantineProvider, WordmarkTitle } from "@ui";
import { Wordmark } from "@/app/chrome/ui/Wordmark";
import { LandingScreen } from "@/features/home/screens/LandingScreen";
import { HERO_TAGLINE } from "@/decisions/landing";

afterEach(cleanup);

function expectTwoTone(heading: HTMLElement) {
  expect(heading).toHaveClass("site-title");
  expect(heading.querySelector(".site-title-word")).toHaveTextContent(/^Fantasy$/);
  const tone = heading.querySelector(".site-title-tone");
  expect(tone).toHaveTextContent(/^Oscars\.$/);
  expect(tone?.querySelector(".site-title-stop")).toHaveAttribute("aria-hidden", "true");
}

describe("WordmarkTitle", () => {
  it("defaults to the header size in the wordmark face", () => {
    render(
      <MantineProvider>
        <WordmarkTitle order={1} />
      </MantineProvider>
    );
    const heading = screen.getByRole("heading", { level: 1, name: "Fantasy Oscars" });
    expectTwoTone(heading);
    expect(heading).toHaveAttribute("data-size", "header");
    expect(heading).toHaveAttribute("data-face", "wordmark");
    expect(heading).toHaveAttribute("data-fo-typo", "page");
  });

  it("takes the hero Title variant at the hero size in the display face", () => {
    render(
      <MantineProvider>
        <WordmarkTitle order={2} size="hero" face="display" />
      </MantineProvider>
    );
    const heading = screen.getByRole("heading", { level: 2, name: "Fantasy Oscars" });
    expectTwoTone(heading);
    expect(heading).toHaveAttribute("data-size", "hero");
    expect(heading).toHaveAttribute("data-face", "display");
    expect(heading).toHaveAttribute("data-fo-typo", "hero");
  });
});

describe("header wordmark", () => {
  it("is the page's h1, linking home", () => {
    render(
      <MantineProvider>
        <MemoryRouter>
          <Wordmark />
        </MemoryRouter>
      </MantineProvider>
    );
    const link = screen.getByRole("link", { name: "Fantasy Oscars" });
    expect(link).toHaveAttribute("href", "/");
    const heading = within(link).getByRole("heading", { level: 1 });
    expectTwoTone(heading);
    expect(heading).toHaveAttribute("data-size", "header");
  });
});

describe("Home hero", () => {
  it("renders the wordmark as an h2, read once, with the tagline", () => {
    const { container } = render(
      <MantineProvider>
        <MemoryRouter>
          <LandingScreen
            user={null}
            authLoading={false}
            view={{
              updates: { state: "ready", content: null },
              seasons: { state: "idle" }
            }}
            refresh={{ updates: async () => {}, seasons: async () => {} }}
          />
        </MemoryRouter>
      </MantineProvider>
    );
    const hero = container.querySelector(".baseline-heroText") as HTMLElement;
    const headings = within(hero).getAllByRole("heading");
    expect(headings).toHaveLength(1);
    const heading = within(hero).getByRole("heading", {
      level: 2,
      name: "Fantasy Oscars"
    });
    expectTwoTone(heading);
    expect(heading).toHaveAttribute("data-size", "hero");
    expect(heading).toHaveAttribute("data-face", "display");
    expect(screen.getAllByRole("heading", { name: "Fantasy Oscars" })).toHaveLength(1);
    expect(within(hero).getByText(HERO_TAGLINE)).toHaveClass("baseline-heroTagline");
  });
});
