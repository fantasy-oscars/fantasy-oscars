import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MantineProvider } from "@ui";
import { CircuitLeagueScreen } from "@/features/circuitLeagues/screens/CircuitLeagueScreen";
import { CircuitScoreBreakdownScreen } from "@/features/circuitLeagues/screens/CircuitScoreBreakdownScreen";
import { CircuitStandingsScreen } from "@/features/circuitLeagues/screens/CircuitStandingsScreen";
import { circuitLeagueEditable } from "@/decisions/circuitLeague";
import { fullSeasonSettingsFrom } from "@/decisions/fullSeasonSettings";
import type { CircuitScoredCeremony, CircuitStandingRow } from "@/lib/types";
import { circuitLeagueDetail, circuitSelection } from "./fixtures";

afterEach(cleanup);

function wrap(node: React.ReactNode) {
  return render(
    <MantineProvider>
      <MemoryRouter>{node}</MemoryRouter>
    </MantineProvider>
  );
}

const ceremony: CircuitScoredCeremony = {
  id: 11,
  code: "cc32",
  name: "Critics Choice",
  event: { id: 2, name: "Critics" },
  nominations_on: "2026-12-05",
  results_on: "2027-01-03"
};

const row = (
  user_id: number,
  username: string,
  rank: number,
  nomination_points: number,
  win_points: number
): CircuitStandingRow => ({
  rank,
  member: { user_id, username, avatar_key: "monkey" },
  points: nomination_points + win_points,
  nomination_points,
  win_points
});

describe("circuit standings screen", () => {
  it("ranks members with their points and links each ceremony to its breakdown", () => {
    wrap(
      <CircuitStandingsScreen
        viewerUserId={6}
        view={{
          state: "ready",
          detail: circuitLeagueDetail({ status: "IN_SEASON" }),
          standings: {
            standings: [row(5, "avery", 1, 2, 4), row(6, "blake", 2, 1, 0)],
            ceremonies: [{ ...ceremony, points_awarded: 7 }]
          }
        }}
      />
    );
    const rows = within(screen.getByRole("list", { name: "Standings" })).getAllByRole(
      "listitem"
    );
    expect(rows.map((r) => r.textContent)).toEqual([
      "1averyNominations 2 pts · Wins 4 pts6 pts",
      "2blake (you)Nominations 1 pt · Wins 0 pts1 pt"
    ]);
    const link = screen.getByRole("link", { name: "Critics Choice" });
    expect(link.getAttribute("href")).toBe(
      "/leagues/3/film-club/seasons/full/4/standings/11"
    );
    const ceremonies = within(screen.getByRole("list", { name: "Points by ceremony" }));
    expect(ceremonies.getByText(/Critics · Nominations Dec 5, 2026/)).toBeTruthy();
    expect(ceremonies.getByText("7 pts awarded")).toBeTruthy();
  });

  it("says when standings have not started, and when no ceremony counts yet", () => {
    wrap(
      <CircuitStandingsScreen
        viewerUserId={null}
        view={{
          state: "not-started",
          detail: circuitLeagueDetail({ status: "DRAFTING" })
        }}
      />
    );
    expect(screen.getByText("Standings start once the draft has finished.")).toBeTruthy();
    cleanup();
    wrap(
      <CircuitStandingsScreen
        viewerUserId={null}
        view={{
          state: "ready",
          detail: circuitLeagueDetail({ status: "IN_SEASON" }),
          standings: { standings: [row(5, "avery", 1, 0, 0)], ceremonies: [] }
        }}
      />
    );
    expect(screen.getByText("No ceremonies count toward this season yet.")).toBeTruthy();
  });
});

describe("circuit ceremony breakdown screen", () => {
  it("lists each member's scoring picks at the ceremony", () => {
    wrap(
      <CircuitScoreBreakdownScreen
        viewerUserId={5}
        view={{
          state: "ready",
          detail: circuitLeagueDetail({ status: "IN_SEASON" }),
          breakdown: {
            ceremony,
            standings: [
              {
                ...row(5, "avery", 1, 1, 2),
                entries: [
                  {
                    selection: circuitSelection(1, "Night Train"),
                    kind: "NOMINATION",
                    occasion_date: "2026-12-05",
                    points: 1
                  },
                  {
                    selection: circuitSelection(1, "Night Train"),
                    kind: "WIN",
                    occasion_date: "2027-01-03",
                    points: 2
                  }
                ]
              },
              { ...row(6, "blake", 2, 0, 0), entries: [] }
            ]
          }
        }}
      />
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Critics Choice" })
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Back to standings" }).getAttribute("href")
    ).toBe("/leagues/3/film-club/seasons/full/4/standings");
    const players = within(screen.getByRole("list", { name: "Points by player" }));
    const avery = players.getByRole("listitem", { name: "1. avery (you)" });
    expect(
      within(avery)
        .getAllByRole("listitem")
        .map((li) => li.textContent)
    ).toEqual(["Night Train (2026)Nomination1 pt", "Night Train (2026)Win2 pts"]);
    const blake = players.getByRole("listitem", { name: "2. blake" });
    expect(within(blake).getByText("No points at this ceremony.")).toBeTruthy();
  });
});

describe("circuit league screen standings link", () => {
  function renderLeague(status: "DRAFTING" | "IN_SEASON") {
    const detail = circuitLeagueDetail({ status });
    wrap(
      <CircuitLeagueScreen
        view={{
          state: "ready",
          detail,
          settings: fullSeasonSettingsFrom(detail),
          editable: circuitLeagueEditable(status)
        }}
        acting={false}
        memberStatus={null}
        lockStatus={null}
        onSaveArea={vi.fn()}
        onJoin={vi.fn()}
        onLeave={vi.fn()}
        onInitialize={vi.fn()}
      />
    );
  }

  it("links to the standings once the season is under way, not during the draft", () => {
    renderLeague("IN_SEASON");
    expect(screen.getByRole("link", { name: "Standings" }).getAttribute("href")).toBe(
      "/leagues/3/film-club/seasons/full/4/standings"
    );
    cleanup();
    renderLeague("DRAFTING");
    expect(screen.queryByRole("link", { name: "Standings" })).toBeNull();
  });
});
