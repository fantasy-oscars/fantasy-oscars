import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { MantineProvider } from "@ui";
import { CircuitRulesScreen } from "@/features/circuitLeagues/screens/CircuitRulesScreen";
import { circuitRulesFrom } from "@/decisions/circuitRules";
import { circuitLeagueDetail } from "./fixtures";

afterEach(cleanup);

function wrap(node: React.ReactNode) {
  return render(
    <MantineProvider>
      <MemoryRouter>{node}</MemoryRouter>
    </MantineProvider>
  );
}

describe("circuit rules screen", () => {
  it("states the ownership instant and the window rule", () => {
    const detail = circuitLeagueDetail();
    wrap(
      <CircuitRulesScreen
        view={{ state: "ready", detail, rules: circuitRulesFrom(detail) }}
      />
    );
    expect(
      screen.getByText(/midnight Pacific \(00:00 America\/Los_Angeles\)/)
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Waiver windows" })).toBeTruthy();
    expect(screen.getByText(/Dropping a contender is allowed at any time/)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Back to season" }).getAttribute("href")
    ).toBe("/leagues/3/film-club/seasons/full/4");
  });

  it("renders the league's non-default settings", () => {
    const detail = circuitLeagueDetail();
    detail.circuit_league.roster_size = 10;
    detail.circuit_league.nomination_points = 3;
    detail.circuit_league.win_bonus_points = 5;
    detail.events[0].weight = 2;
    detail.events[1].enabled = false;
    detail.categories[0].weight = 1.5;
    detail.categories[1].max_owned = 2;
    wrap(
      <CircuitRulesScreen
        view={{ state: "ready", detail, rules: circuitRulesFrom(detail) }}
      />
    );

    expect(
      screen.getByText(/3 pts for each nomination; 5 pts more for each win/)
    ).toBeTruthy();
    expect(screen.getByText("Each player holds up to 10 contenders.")).toBeTruthy();

    const events = within(screen.getByRole("list", { name: "Events" }));
    expect(events.getByText("Golden Reel")).toBeTruthy();
    expect(events.getByText("Points ×2")).toBeTruthy();
    expect(events.queryByText("Guild Awards")).toBeNull();
    expect(screen.getByText("Not counted: Guild Awards.")).toBeTruthy();

    const categories = within(screen.getByRole("list", { name: "Categories" }));
    expect(categories.getByText("Points ×1.5 · No limit")).toBeTruthy();
    expect(categories.getByText("At most 2")).toBeTruthy();
  });

  it("says so when no event counts", () => {
    const detail = circuitLeagueDetail();
    detail.events.forEach((e) => (e.enabled = false));
    wrap(
      <CircuitRulesScreen
        view={{ state: "ready", detail, rules: circuitRulesFrom(detail) }}
      />
    );
    expect(screen.getByText(/No events count in this league/)).toBeTruthy();
  });

  it("shows a not-found state", () => {
    wrap(
      <CircuitRulesScreen
        view={{ state: "error", message: "Season not found", notFound: true }}
      />
    );
    expect(screen.queryByText(/midnight Pacific/)).toBeNull();
  });
});
