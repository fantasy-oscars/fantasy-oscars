import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MantineProvider } from "@ui";
import { CircuitDraftScreen } from "@/features/circuitLeagues/screens/CircuitDraftScreen";
import { CircuitLeagueScreen } from "@/features/circuitLeagues/screens/CircuitLeagueScreen";
import {
  circuitDraftClock,
  circuitDraftPhase,
  circuitQueueRows,
  type CircuitPickGate
} from "@/decisions/circuitDraft";
import {
  describeConnection,
  type DraftConnectionState
} from "@/decisions/draft/connection";
import type { ContenderPickerProps } from "@/features/contenders/ui/ContenderPicker";
import { circuitLeagueEditable } from "@/decisions/circuitLeague";
import { fullSeasonSettingsFrom } from "@/decisions/fullSeasonSettings";
import type { CircuitDraftSnapshot, CircuitLeagueDetail } from "@/lib/types";
import {
  circuitDraftSnapshot,
  circuitLeagueDetail,
  circuitQueue,
  circuitSelection
} from "./fixtures";

afterEach(cleanup);

const ROW_HEIGHT = 48;
const NOW = Date.parse("2026-11-28T18:05:00Z");
const queue = circuitQueue([
  circuitSelection(33, "Gaslight", "Ingrid Bergman"),
  circuitSelection(31, "Sunset Boulevard"),
  circuitSelection(34, "Laura")
]);

function renderDraft(input: {
  detail?: CircuitLeagueDetail;
  snapshot?: CircuitDraftSnapshot | null;
  queue?: boolean;
  canStart?: boolean;
  gate?: CircuitPickGate | null;
  canPause?: boolean;
  draftPicker?: ContenderPickerProps | null;
  connectionState?: DraftConnectionState;
}) {
  const detail = input.detail ?? circuitLeagueDetail({ status: "INITIALIZED" });
  const snapshot = input.snapshot ?? null;
  const handlers = {
    onRemoveFromQueue: vi.fn(),
    onReorderQueue: vi.fn(),
    onStart: vi.fn(),
    onTogglePause: vi.fn()
  };
  render(
    <MantineProvider>
      <MemoryRouter>
        <CircuitDraftScreen
          view={{
            state: "ready",
            detail,
            phase: circuitDraftPhase(snapshot),
            snapshot,
            queue:
              input.queue === false
                ? null
                : circuitQueueRows(queue, detail.categories, snapshot),
            canStart: input.canStart ?? snapshot === null,
            gate: input.gate ?? null,
            canPause: input.canPause ?? false,
            announcement: ""
          }}
          viewerUserId={5}
          picker={null}
          draftPicker={input.draftPicker ?? null}
          connection={describeConnection(input.connectionState ?? "connected")}
          connectionState={input.connectionState ?? "connected"}
          clock={snapshot ? circuitDraftClock(snapshot, NOW) : null}
          pickStatus={null}
          pausing={false}
          pauseStatus={null}
          queueBusy={false}
          removingSelectionId={null}
          queueStatus={null}
          starting={false}
          startStatus={null}
          {...handlers}
        />
      </MemoryRouter>
    </MantineProvider>
  );
  return handlers;
}

/** jsdom has no layout: give each queue row a box so the keyboard finds its neighbour. */
function layOutQueue() {
  const rows = within(screen.getByRole("list", { name: "Your queue" })).getAllByRole(
    "listitem"
  );
  rows.forEach((row, index) => {
    row.getBoundingClientRect = () =>
      ({
        top: index * ROW_HEIGHT,
        bottom: (index + 1) * ROW_HEIGHT,
        left: 0,
        right: 300,
        width: 300,
        height: ROW_HEIGHT,
        x: 0,
        y: index * ROW_HEIGHT,
        toJSON: () => ({})
      }) as DOMRect;
  });
}

describe("circuit draft lobby", () => {
  it("shows the draft facts, players and settings, and lets the commissioner start", () => {
    const handlers = renderDraft({});
    expect(screen.getByRole("heading", { name: "Draft lobby" })).toBeTruthy();
    expect(screen.getByText("Snake, drawn at random")).toBeTruthy();
    expect(screen.getByText("90 seconds")).toBeTruthy();
    const players = screen.getByRole("region", { name: "Players" });
    expect(within(players).getByText("avery (you)")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Settings" }).textContent).toMatch(
      /Scoring/
    );
    fireEvent.click(screen.getByRole("button", { name: "Start draft" }));
    expect(handlers.onStart).toHaveBeenCalledTimes(1);
  });

  it("offers no start to players, and no queue to viewers who have not joined", () => {
    renderDraft({
      detail: circuitLeagueDetail({
        status: "INITIALIZED",
        viewer: { can_manage: false, is_member: false }
      }),
      canStart: false,
      queue: false
    });
    expect(screen.queryByRole("button", { name: "Start draft" })).toBeNull();
    expect(screen.getByText(/The commissioner starts the draft/)).toBeTruthy();
    expect(screen.getByText(/you have no draft queue/)).toBeTruthy();
  });
});

describe("circuit draft queue editor", () => {
  it("moves and removes rows with buttons", () => {
    const handlers = renderDraft({});
    expect(
      (
        screen.getByRole("button", {
          name: /Move Ingrid Bergman.* up/
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Move Ingrid Bergman.* down/ }));
    expect(handlers.onReorderQueue).toHaveBeenLastCalledWith([31, 33, 34]);
    fireEvent.click(screen.getByRole("button", { name: /Move Laura.* up/ }));
    expect(handlers.onReorderQueue).toHaveBeenLastCalledWith([33, 34, 31]);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove Sunset Boulevard (2026) from your queue"
      })
    );
    expect(handlers.onRemoveFromQueue).toHaveBeenCalledWith(31);
  });

  it("reorders from the keyboard on a row's grip: Space, arrow, Space", async () => {
    const user = userEvent.setup();
    const handlers = renderDraft({});
    layOutQueue();
    screen.getByRole("button", { name: /Reorder Ingrid Bergman/ }).focus();
    await user.keyboard(" ");
    await user.keyboard("{ArrowDown}");
    await user.keyboard(" ");
    expect(handlers.onReorderQueue).toHaveBeenCalledWith([31, 33, 34]);
  });

  it("stays editable during the draft and marks drafted contenders", () => {
    const handlers = renderDraft({
      detail: circuitLeagueDetail({ status: "DRAFTING" }),
      snapshot: circuitDraftSnapshot({ picks: 2 })
    });
    const list = screen.getByRole("list", { name: "Your queue" });
    expect(within(list).getByText(/Best Picture · Drafted/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Move Laura.* up/ }));
    expect(handlers.onReorderQueue).toHaveBeenCalledWith([33, 34, 31]);
  });
});

describe("circuit draft board", () => {
  it("shows who is on the clock and the board by player", () => {
    renderDraft({
      detail: circuitLeagueDetail({ status: "DRAFTING" }),
      snapshot: circuitDraftSnapshot({ picks: 3 })
    });
    expect(screen.getByRole("heading", { name: "Draft room" })).toBeTruthy();
    expect(screen.getByText("On the clock: Round 2, pick 4 · avery")).toBeTruthy();
    const avery = screen.getByRole("region", { name: "avery (you)" });
    expect(within(avery).getByText("Sunset Boulevard (2026)")).toBeTruthy();
    const blake = screen.getByRole("region", { name: "blake" });
    expect(within(blake).getByText("Missed")).toBeTruthy();
    expect(
      within(blake).getByText("A supplemental pick follows the last round")
    ).toBeTruthy();
  });

  it("switches to the board by category and labels the supplemental round", () => {
    renderDraft({
      detail: circuitLeagueDetail({ status: "IN_SEASON" }),
      snapshot: circuitDraftSnapshot()
    });
    expect(screen.getByText(/^The draft is complete/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Your queue" })).toBeNull();
    const blake = screen.getByRole("region", { name: "blake" });
    expect(within(blake).getByText("Missed again, so a chip for pick 3")).toBeTruthy();
    expect(within(blake).getByText(/^Supplemental, for pick 3/)).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "By category" }));
    const acting = screen.getByRole("region", { name: "Best Actress" });
    expect(within(acting).getByText("Ingrid Bergman, Gaslight (2026)")).toBeTruthy();
    expect(within(acting).getByText(/avery · From queue/)).toBeTruthy();
  });
});

/** The picker at its last step: Best Picture, Laura, ready to confirm. */
function confirmPicker(): ContenderPickerProps {
  return {
    categoriesState: "ready",
    categoriesError: null,
    categories: [{ id: 20, name: "Best Picture", kind: "FILM" }],
    step: "confirm",
    category: { id: 20, name: "Best Picture", kind: "FILM" },
    film: { tmdb_id: 501, title: "Laura", release_year: 1944, poster_url: null },
    person: null,
    search: { query: "Laura", hint: null, state: "ready", error: null, results: [] },
    credits: { state: "idle", error: null, people: [], total: 0, filter: "" },
    picking: false,
    pickError: null,
    picked: null,
    actions: {
      selectCategory: vi.fn(),
      setQuery: vi.fn(),
      selectFilm: vi.fn(),
      changeFilm: vi.fn(),
      setPeopleFilter: vi.fn(),
      selectPerson: vi.fn(),
      changePerson: vi.fn(),
      retryCredits: vi.fn(),
      pick: vi.fn(),
      startOver: vi.fn()
    }
  };
}

describe("circuit draft room", () => {
  const live = circuitDraftSnapshot({ picks: 1 });

  it("lets the player on the clock draft through the picker", async () => {
    const draftPicker = confirmPicker();
    renderDraft({
      detail: circuitLeagueDetail({ status: "DRAFTING" }),
      snapshot: live,
      gate: { onTheClock: true, canPick: true, reason: "You're on the clock." },
      draftPicker
    });
    expect(screen.getByRole("heading", { name: "Your pick" })).toBeTruthy();
    expect(screen.getByTestId("circuit-pick-reason").textContent).toBe(
      "You're on the clock."
    );
    await userEvent.click(screen.getByRole("button", { name: "Draft Laura" }));
    expect(draftPicker.actions.pick).toHaveBeenCalled();
  });

  it("shows everyone else the picker disabled, with the reason", () => {
    renderDraft({
      detail: circuitLeagueDetail({ status: "DRAFTING" }),
      snapshot: live,
      gate: { onTheClock: false, canPick: false, reason: "Waiting for blake to pick." },
      draftPicker: confirmPicker()
    });
    const group = screen.getByRole("group", { name: "Draft a contender" });
    expect(group.getAttribute("aria-describedby")).toBe("circuit-pick-reason");
    expect(screen.getByTestId("circuit-pick-reason").textContent).toBe(
      "Waiting for blake to pick."
    );
    const draft = screen.getByRole("button", { name: "Draft Laura" });
    expect((draft as HTMLButtonElement).matches(":disabled")).toBe(true);
    expect(
      (
        within(group).getByRole("textbox", { name: "Category" }) as HTMLInputElement
      ).matches(":disabled")
    ).toBe(true);
    // The queue stays editable alongside.
    expect(screen.getByRole("list", { name: "Your queue" })).toBeTruthy();
  });

  it("shows the clock and Pause for the commissioner, and a lost connection", async () => {
    const timed = {
      ...live,
      draft: { ...live.draft, pick_deadline_at: "2026-11-28T18:05:42Z" }
    };
    const handlers = renderDraft({
      detail: circuitLeagueDetail({ status: "DRAFTING" }),
      snapshot: timed,
      gate: { onTheClock: false, canPick: false, reason: "Waiting for blake to pick." },
      canPause: true,
      connectionState: "reconnecting"
    });
    expect(screen.getByTestId("circuit-pick-clock").textContent).toBe("0:42 left");
    expect(screen.getByText("On the clock: Round 1, pick 2 · blake")).toBeTruthy();
    expect(screen.getByTestId("draft-connection-indicator").textContent).toMatch(
      /Reconnecting/
    );
    await userEvent.click(screen.getByRole("button", { name: "Pause draft" }));
    expect(handlers.onTogglePause).toHaveBeenCalled();
  });

  it("marks the viewer's turn and the supplemental round", () => {
    renderDraft({
      detail: circuitLeagueDetail({ status: "DRAFTING" }),
      snapshot: circuitDraftSnapshot({ picks: 4, status: "SUPPLEMENTAL" }),
      gate: {
        onTheClock: true,
        canPick: true,
        reason: "You're on the clock for your supplemental pick."
      }
    });
    const bar = screen.getByTestId("circuit-turn-bar");
    expect(within(bar).getByText("Your turn")).toBeTruthy();
    expect(within(bar).getByText(/Supplemental, for pick 3 · blake/)).toBeTruthy();
    expect(within(bar).getByText(/^Supplemental round:/)).toBeTruthy();
  });
});

describe("season page", () => {
  it("links to the draft lobby, then the room", () => {
    for (const [status, label] of [
      ["INITIALIZED", "Draft lobby"],
      ["DRAFTING", "Draft room"]
    ] as const) {
      const detail = circuitLeagueDetail({ status });
      render(
        <MantineProvider>
          <MemoryRouter>
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
          </MemoryRouter>
        </MantineProvider>
      );
      expect(screen.getByRole("link", { name: label }).getAttribute("href")).toBe(
        "/leagues/3/film-club/seasons/full/4/draft"
      );
      cleanup();
    }
  });
});
