import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MantineProvider } from "@ui";
import { CircuitLeagueScreen } from "@/features/circuitLeagues/screens/CircuitLeagueScreen";
import { CircuitScoreBreakdownScreen } from "@/features/circuitLeagues/screens/CircuitScoreBreakdownScreen";
import { CircuitStandingsScreen } from "@/features/circuitLeagues/screens/CircuitStandingsScreen";
import { circuitLeagueEditable } from "@/decisions/circuitLeague";
import { fullSeasonSettingsFrom } from "@/decisions/fullSeasonSettings";
import type { CircuitScoredCeremony, CircuitStandingRow } from "@/lib/types";
import { circuitLeagueDetail } from "./fixtures";
import {
  CEREMONY_NAMES,
  LEDGER,
  SEASON,
  breakdownFor,
  contenders,
  rosterFor,
  sum
} from "./seededLedger";

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

function renderStandings(input: {
  view: React.ComponentProps<typeof CircuitStandingsScreen>["view"];
  viewParam?: string | null;
  viewerUserId?: number | null;
  resultsMode?: "contenders" | "rosters";
  onViewChange?: (view: string) => void;
  onResultsModeChange?: (mode: "contenders" | "rosters") => void;
}) {
  const onViewChange = input.onViewChange ?? vi.fn();
  const onResultsModeChange = input.onResultsModeChange ?? vi.fn();
  wrap(
    <CircuitStandingsScreen
      viewerUserId={input.viewerUserId ?? null}
      viewParam={input.viewParam ?? null}
      onViewChange={onViewChange}
      resultsMode={input.resultsMode ?? "contenders"}
      onResultsModeChange={onResultsModeChange}
      view={input.view}
    />
  );
  return { onViewChange, onResultsModeChange };
}

const inSeason = {
  state: "ready",
  detail: circuitLeagueDetail({ status: "IN_SEASON" }),
  standings: {
    standings: [row(5, "avery", 1, 2, 4), row(6, "blake", 2, 1, 0)],
    ceremonies: [{ ...ceremony, points_awarded: 7 }]
  },
  finalResults: null
} as const;

describe("circuit standings screen", () => {
  it("opens on the leaderboard, ranking members with their points", () => {
    const { onViewChange } = renderStandings({ view: inSeason, viewerUserId: 6 });
    // In season the switch has two views; the leaderboard is the default.
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByRole("radio", { name: "Leaderboard" })).toBeChecked();
    expect(screen.queryByRole("radio", { name: "Final results" })).toBeNull();
    const rows = within(screen.getByRole("list", { name: "Standings" })).getAllByRole(
      "listitem"
    );
    expect(rows.map((r) => r.textContent)).toEqual([
      "1averyNominations 2 pts · Wins 4 pts6 pts",
      // The viewer's ", you" is visually hidden; nothing visible marks them.
      "2blake, youNominations 1 pt · Wins 0 pts1 pt"
    ]);
    // The avatar comes before each name.
    expect(rows[0]!.querySelector(".fo-animalAvatar")).not.toBeNull();
    expect(rows[1]!.querySelector(".fo-animalAvatar")).not.toBeNull();
    // Only the current view shows; its heading is hidden but kept in the outline.
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)
    ).toEqual(["Leaderboard"]);
    expect(screen.queryByRole("list", { name: "Points by ceremony" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "By ceremony" }));
    expect(onViewChange).toHaveBeenCalledWith("ceremonies");
  });

  it("shows By ceremony from the URL, linking each ceremony to its breakdown", () => {
    renderStandings({ view: inSeason, viewParam: "ceremonies" });
    expect(screen.getByRole("radio", { name: "By ceremony" })).toBeChecked();
    expect(screen.queryByRole("list", { name: "Standings" })).toBeNull();
    const link = screen.getByRole("link", { name: "Critics Choice" });
    expect(link.getAttribute("href")).toBe(
      "/leagues/3/film-club/seasons/full/4/standings/11"
    );
    const ceremonies = within(screen.getByRole("list", { name: "Points by ceremony" }));
    expect(ceremonies.getByText(/Critics · Nominations Dec 5, 2026/)).toBeTruthy();
    expect(ceremonies.getByText("7 pts awarded")).toBeTruthy();
  });

  it("falls back to the leaderboard for Final results before the season is complete", () => {
    renderStandings({ view: inSeason, viewParam: "results" });
    expect(screen.getByRole("radio", { name: "Leaderboard" })).toBeChecked();
    expect(screen.getByRole("list", { name: "Standings" })).toBeTruthy();
  });

  it("says when standings have not started, and when no ceremony counts yet", () => {
    renderStandings({
      view: { state: "not-started", detail: circuitLeagueDetail({ status: "DRAFTING" }) }
    });
    expect(screen.getByText("Standings start once the draft has finished.")).toBeTruthy();
    expect(screen.queryByRole("radiogroup", { name: "Show standings" })).toBeNull();
    cleanup();
    renderStandings({
      viewParam: "ceremonies",
      view: {
        state: "ready",
        detail: circuitLeagueDetail({ status: "IN_SEASON" }),
        standings: { standings: [row(5, "avery", 1, 0, 0)], ceremonies: [] },
        finalResults: null
      }
    });
    expect(screen.getByText("No ceremonies count toward this season yet.")).toBeTruthy();
  });

  it("draws the switch and five rows while loading", () => {
    renderStandings({ view: { state: "loading" } });
    const status = screen.getByRole("status", { name: "Loading standings" });
    expect(status.querySelectorAll(".mantine-Skeleton-root")).toHaveLength(7);
  });
});

/** A rendered pill's figure: "+3", "0", "+1.5", "−1". */
const figure = (pill: Element) =>
  Number((pill.querySelector(".dr-pill-points")?.textContent ?? "0").replace("−", "-"));
const total = (values: number[]) =>
  values.reduce((a, b) => a + Math.round(b * 100), 0) / 100;

function renderBreakdown(input: {
  ceremonyId?: number;
  mode?: "player" | "category";
  onModeChange?: (mode: "player" | "category") => void;
}) {
  const props = {
    viewerUserId: 5,
    mode: input.mode ?? "player",
    onModeChange: input.onModeChange ?? vi.fn()
  } as const;
  const detail = circuitLeagueDetail({ status: "IN_SEASON" });
  const view = (breakdown: ReturnType<typeof breakdownFor>) =>
    ({ state: "ready", detail, breakdown }) as const;
  const ui = (breakdown: ReturnType<typeof breakdownFor>) => (
    <MantineProvider>
      <MemoryRouter>
        <CircuitScoreBreakdownScreen {...props} view={view(breakdown)} />
      </MemoryRouter>
    </MantineProvider>
  );
  const result = render(ui(breakdownFor(input.ceremonyId ?? 1)));
  return { rerender: (b: ReturnType<typeof breakdownFor>) => result.rerender(ui(b)) };
}

describe("circuit ceremony points screen", () => {
  it("shows By player as roster cards whose pills add up to each total", async () => {
    renderBreakdown({});
    expect(
      screen.getByRole("heading", { level: 2, name: "Golden Reel 2027" })
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Back to standings" }).getAttribute("href")
    ).toBe("/leagues/3/film-club/seasons/full/4/standings");
    expect(screen.getByRole("radio", { name: "By player" })).toBeChecked();
    const cards = within(screen.getByRole("list", { name: "Points by player" }))
      .getAllByRole("listitem")
      .filter((li) => li.querySelector(".fo-seasonRosterCard"));
    expect(
      cards.map((c) => c.querySelector(".fo-seasonRosterCard-name")?.textContent)
    ).toEqual(["1. bob", "2. alice, you", "3. cy"]);
    for (const card of cards) {
      const pills = [...card.querySelectorAll(".dr-pill")];
      const score = Number(card.querySelector(".fo-seasonRosterCard-score")?.textContent);
      expect(total(pills.map(figure))).toBe(score);
    }
    // The ledger: alice's dropped Night Train still counts, dashed, with no caption.
    const alice = within(cards[1]!);
    const dropped = alice.getByRole("group", {
      name: "Best Picture: Night Train (2026), 1 point, dropped"
    });
    expect(dropped.className).toContain("is-dropped");
    expect(alice.queryByText("Dropped")).toBeNull();
    expect(alice.queryByText(/dropped/i)).toBeNull();
    // Its card says since when.
    fireEvent.focus(dropped);
    expect(await screen.findByText("Dropped since Feb 14, 2027")).toBeTruthy();
    expect(alice.getByText("Nominations 2 pts · Wins 0 pts")).toBeTruthy();
    // bob's wins here are gold, and the card's breakdown names him.
    const won = within(cards[0]!).getByRole("group", {
      name: "Best Picture: Night Train (2026), 2 points"
    });
    expect(won.className).toContain("is-winner");
    fireEvent.focus(won);
    expect(await screen.findByText("Points for bob")).toBeTruthy();
    expect(within(cards[2]!).getByText("No points at this ceremony.")).toBeTruthy();
  });

  it("shows By category as board cards that match the ledger", async () => {
    renderBreakdown({ mode: "category" });
    const board = screen.getByRole("list", { name: "Points by category" });
    const cards = within(board).getAllByRole("region");
    // Every season category gets a card, in category order.
    expect(
      cards.map((c) => c.querySelector(".fo-seasonRosterCard-name")?.textContent)
    ).toEqual(["Best Picture", "Best Actress"]);
    // Each card's score is the sum of its pills; the cards sum to the ceremony.
    const ceremonyTotal = sum(
      LEDGER.filter((r) => r.ceremonyId === 1).map((r) => r.points)
    );
    const scores = cards.map((card) => {
      const score = Number(card.querySelector(".fo-seasonRosterCard-score")?.textContent);
      expect(total([...card.querySelectorAll(".dr-pill")].map(figure))).toBe(score);
      return score;
    });
    expect(total(scores)).toBe(ceremonyTotal);
    expect(total([...board.querySelectorAll(".dr-pill")].map(figure))).toBe(
      ceremonyTotal
    );

    // Winners come first and are gold; a pick dropped since is dashed and says so.
    const picture = cards[0]!;
    const pills = [...picture.querySelectorAll(".dr-pill")];
    expect(pills.map((p) => p.getAttribute("aria-label"))).toEqual([
      "Best Picture: Night Train (2026), 2 points, bob",
      "Best Picture: Night Train (2026), 1 point, alice, dropped",
      "Best Picture: Static (2026), 1 point, alice"
    ]);
    expect(pills[0]!.className).toContain("is-winner");
    expect(pills[1]!.className).toContain("is-dropped");
    expect(pills[1]!.className).not.toContain("is-winner");
    expect(picture.textContent).not.toMatch(/dropped/i);
    fireEvent.focus(pills[1]!);
    expect(await screen.findByText("Dropped since Feb 14, 2027")).toBeTruthy();
    expect(picture.querySelectorAll(".fo-playerName .fo-animalAvatar")).toHaveLength(3);

    // bob's nomination and win for Paper Moon are one gold pill; its card splits them.
    const paperMoon = within(cards[1]!).getByRole("group", {
      name: "Best Actress: Ada Lane, Paper Moon (2026), 3 points, bob"
    });
    expect(paperMoon.className).toContain("is-winner");
    fireEvent.focus(paperMoon);
    expect(await screen.findByText("Points for bob")).toBeTruthy();
    expect(screen.getByText("Nomination +1 · Win +2")).toBeTruthy();
  });

  it("opens the nominee card with the points on a tap on a phone", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false
    }));
    try {
      renderBreakdown({});
      fireEvent.click(
        screen.getByRole("button", { name: "Best Picture: Night Train (2026), 2 points" })
      );
      const card = await screen.findByRole("dialog", { name: "Nominee details" });
      expect(within(card).getByText("Points for bob")).toBeTruthy();
      expect(within(card).getByText("Win +2")).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("switches views and says when a live refresh changed the points", () => {
    const onModeChange = vi.fn();
    const { rerender } = renderBreakdown({ onModeChange });
    expect(screen.getByRole("status").textContent).toBe("");
    fireEvent.click(screen.getByRole("radio", { name: "By category" }));
    expect(onModeChange).toHaveBeenCalledWith("category");
    rerender(breakdownFor(1));
    expect(screen.getByRole("status").textContent).toBe("Points updated");
  });
});

describe("circuit final results", () => {
  const complete = {
    state: "ready",
    detail: circuitLeagueDetail({ status: "COMPLETE" }),
    standings: {
      standings: SEASON,
      ceremonies: [1, 2].map((id) => ({
        ...ceremony,
        id,
        name: CEREMONY_NAMES[id]!,
        points_awarded: sum(
          LEDGER.filter((r) => r.ceremonyId === id).map((r) => r.points)
        )
      }))
    },
    finalResults: {
      state: "ready",
      contenders: contenders(),
      rosters: [5, 6, 7].map(rosterFor)
    }
  } as const;

  function renderFinal(mode: "contenders" | "rosters", onResultsModeChange = vi.fn()) {
    renderStandings({
      view: complete,
      viewParam: "results",
      viewerUserId: 5,
      resultsMode: mode,
      onResultsModeChange
    });
    return onResultsModeChange;
  }

  it("reports the same numbers in every view for the seeded league", () => {
    const seasonTotal = sum(SEASON.map((s) => s.points));
    // Leaderboard: each member's total as the ledger sums it.
    renderStandings({ view: complete });
    const figures = [
      ...screen
        .getByRole("list", { name: "Standings" })
        .querySelectorAll(".season-rowFigure")
    ].map((f) => f.textContent);
    expect(figures).toEqual(["6.5 pts", "2 pts", "1 pt"]);
    cleanup();
    // Final results: the scoring contenders add up to the leaderboard.
    renderFinal("contenders");
    const contenderPills = within(
      screen.getByRole("list", { name: "All scoring contenders" })
    )
      .getAllByRole("listitem")
      .filter((li) => li.querySelector(".circuit-contenderRank"))
      .map((r) => r.querySelector(".dr-pill")!);
    expect(total(contenderPills.map(figure))).toBe(seasonTotal);
    cleanup();
    // By ceremony: the points awarded add up to the leaderboard too.
    renderStandings({ view: complete, viewParam: "ceremonies" });
    const awarded = within(screen.getByRole("list", { name: "Points by ceremony" }))
      .getAllByText(/pts? awarded$/)
      .map((t) => Number(t.textContent!.split(" ")[0]));
    expect(total(awarded)).toBe(seasonTotal);
  });

  it("lists every scoring contender, adding up to the leaderboard", () => {
    const onChange = renderFinal("contenders");
    // Complete: three views, Final results chosen from the URL.
    expect(screen.getAllByRole("radiogroup")[0]).toHaveAccessibleName("Show standings");
    expect(screen.getByRole("radio", { name: "Final results" })).toBeChecked();
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)
    ).toEqual(["Final results"]);
    const rows = within(screen.getByRole("list", { name: "All scoring contenders" }))
      .getAllByRole("listitem")
      .filter((li) => li.querySelector(".circuit-contenderRank"));
    const pills = rows.map((r) => r.querySelector(".dr-pill")!);
    expect(total(pills.map(figure))).toBe(sum(SEASON.map((s) => s.points)));
    // Shared ranks for tied totals; Night Train won once, so it is gold.
    expect(
      rows.map((r) => r.querySelector(".circuit-contenderRank")?.textContent)
    ).toEqual(["1", "2", "3", "3"]);
    const nightTrain = rows.find((r) => r.textContent?.includes("Night Train"))!;
    expect(nightTrain.querySelector(".dr-pill")!.className).toContain("is-winner");
    expect(nightTrain.textContent).toContain("bob +2");
    expect(nightTrain.textContent).toContain("alice +1");
    // The points sit outside the name, so a long name never truncates them.
    const bob = within(nightTrain).getByTitle("bob");
    expect(bob.textContent).toBe("bob");
    const chip = bob.closest(".circuit-pointsPlayer")!;
    expect(chip.querySelector(".fo-animalAvatar")).not.toBeNull();
    expect(chip.querySelector(".circuit-pointsPlayerPoints")!.textContent).toBe("+2");
    fireEvent.click(screen.getByRole("radio", { name: "Final rosters" }));
    expect(onChange).toHaveBeenCalledWith("rosters");
  });

  it("draws final rosters whose pills and dropped remainder add up to each total", () => {
    renderFinal("rosters");
    const cards = within(screen.getByRole("list", { name: "Final rosters" }))
      .getAllByRole("listitem")
      .filter((li) => li.querySelector(".fo-seasonRosterCard"));
    expect(cards).toHaveLength(3);
    for (const card of cards) {
      const pills = [...card.querySelectorAll(".dr-pill")].map(figure);
      const note = card.textContent?.match(/Plus ([\d.]+) pts? from picks dropped/);
      const score = Number(card.querySelector(".fo-seasonRosterCard-score")?.textContent);
      expect(total([...pills, note ? Number(note[1]) : 0])).toBe(score);
    }
    expect(
      within(cards[1]!).getByText("Plus 1 pt from picks dropped during the season.")
    ).toBeTruthy();
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
