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
import { circuitStagedRows } from "@/decisions/circuitDraftRoom";
import {
  describeConnection,
  type DraftConnectionState
} from "@/decisions/draft/connection";
import type {
  ContenderConfirmAction,
  ContenderPickerProps
} from "@/features/contenders/ui/ContenderPicker";
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
const rebecca = circuitSelection(35, "Rebecca");
const queue = circuitQueue(
  [
    circuitSelection(33, "Gaslight", "Ingrid Bergman"),
    circuitSelection(31, "Sunset Boulevard"),
    circuitSelection(34, "Laura")
  ],
  [rebecca]
);

function renderDraft(input: {
  detail?: CircuitLeagueDetail;
  snapshot?: CircuitDraftSnapshot | null;
  queue?: boolean;
  canStart?: boolean;
  gate?: CircuitPickGate | null;
  canPause?: boolean;
  picker?: ContenderPickerProps | null;
  connectionState?: DraftConnectionState;
}) {
  const detail = input.detail ?? circuitLeagueDetail({ status: "INITIALIZED" });
  const snapshot = input.snapshot ?? null;
  const handlers = {
    onRemoveFromQueue: vi.fn(),
    onReorderQueue: vi.fn(),
    onQueue: vi.fn(),
    onStage: vi.fn(),
    onUnstage: vi.fn(),
    onDraft: vi.fn(() => Promise.resolve(true)),
    onStart: vi.fn(),
    onTogglePause: vi.fn(),
    onToggleSound: vi.fn(),
    onRailOpenChange: vi.fn()
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
            staged:
              input.queue === false
                ? null
                : circuitStagedRows(queue, detail.categories, snapshot),
            canStart: input.canStart ?? snapshot === null,
            gate: input.gate ?? null,
            canPause: input.canPause ?? false,
            announcement: ""
          }}
          viewerUserId={5}
          viewerLabel="avery"
          viewerAvatarKey={null}
          picker={input.picker ?? null}
          connection={describeConnection(input.connectionState ?? "connected")}
          connectionState={input.connectionState ?? "connected"}
          clock={snapshot ? circuitDraftClock(snapshot, NOW) : null}
          pickStatus={null}
          picking={false}
          pauseStatus={null}
          queueBusy={false}
          removingSelectionId={null}
          queueStatus={null}
          startStatus={null}
          soundEnabled={false}
          railPreferences={{ ledger: null, roster: null, autodraft: null }}
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

/*
 * A row's menu item by name. jsdom closes Mantine's menu as soon as it opens,
 * so the items are found among hidden elements and clicked directly.
 */
async function openRowMenu(row: string) {
  await userEvent.click(screen.getByRole("button", { name: `More actions for ${row}` }));
  await screen.findAllByRole("menuitem", { hidden: true });
}

function menuItem(name: string) {
  return screen.getByRole("menuitem", { name, hidden: true });
}

async function chooseRowAction(row: string, action: string) {
  await openRowMenu(row);
  fireEvent.click(menuItem(action));
}

describe("circuit draft lobby", () => {
  it("shows the facts, players and settings in the room, and starts from the header", () => {
    const handlers = renderDraft({});
    expect(screen.getByRole("heading", { name: "Draft lobby" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Prepare your picks" })).toBeTruthy();
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

  it("keeps history and the roster closed until the draft starts, with staging open", () => {
    renderDraft({});
    const history = screen.getByRole("button", { name: "Expand draft history" });
    expect(history.getAttribute("aria-disabled")).toBe("true");
    const roster = screen.getByRole("button", { name: "Expand my roster" });
    expect(roster.getAttribute("aria-disabled")).toBe("true");
    const staging = screen.getByRole("region", { name: "Staging" });
    expect(within(staging).getByRole("list", { name: "Your queue" })).toBeTruthy();
    // No Draft buttons before the draft starts.
    expect(within(staging).queryByRole("button", { name: /^Draft / })).toBeNull();
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
    expect(screen.getByText(/you have no queue\./)).toBeTruthy();
  });
});

describe("circuit draft staging", () => {
  it("reorders, stages and removes queued contenders from each row's menu", async () => {
    const handlers = renderDraft({});
    await openRowMenu("Ingrid Bergman, Gaslight (2026)");
    expect(menuItem("Move up").matches(":disabled, [data-disabled]")).toBe(true);
    fireEvent.click(menuItem("Move down"));
    expect(handlers.onReorderQueue).toHaveBeenLastCalledWith([31, 33, 34]);

    cleanup();

    // A fresh room per row: jsdom keeps the last menu's items around.
    const staging = renderDraft({});
    await chooseRowAction("Sunset Boulevard (2026)", "Move to staged");
    expect(staging.onStage).toHaveBeenCalledWith(expect.objectContaining({ id: 31 }));
    cleanup();

    const removing = renderDraft({});
    await chooseRowAction("Laura (2026)", "Remove from queue");
    expect(removing.onRemoveFromQueue).toHaveBeenCalledWith(34);
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

  it("lists staged contenders, which move to the queue or come off the list", async () => {
    const handlers = renderDraft({});
    const staged = screen.getByRole("list", { name: "Your staged contenders" });
    expect(within(staged).getByText("Rebecca (2026)")).toBeTruthy();
    await chooseRowAction("Rebecca (2026)", "Add to queue");
    expect(handlers.onQueue).toHaveBeenCalledWith(expect.objectContaining({ id: 35 }));
    await chooseRowAction("Rebecca (2026)", "Remove from staged");
    expect(handlers.onUnstage).toHaveBeenCalledWith(35);
  });

  it("drafts straight from the queue or staged list for the player on the clock", async () => {
    const handlers = renderDraft({
      detail: circuitLeagueDetail({ status: "DRAFTING" }),
      snapshot: circuitDraftSnapshot({ picks: 3 }),
      gate: { onTheClock: true, canPick: true, reason: "You're on the clock." }
    });
    const staging = screen.getByRole("region", { name: "Staging" });
    expect(within(staging).getByTestId("circuit-staging-note").textContent).toMatch(
      /^You're on the clock: draft from here/
    );
    // Drafted contenders stay listed, struck through, with no Draft button.
    expect(within(staging).getByText(/Best Picture · Drafted/)).toBeTruthy();
    expect(
      within(staging).queryByRole("button", { name: "Draft Sunset Boulevard (2026)" })
    ).toBeNull();
    await userEvent.click(
      within(staging).getByRole("button", { name: "Draft Laura (2026)" })
    );
    expect(handlers.onDraft).toHaveBeenCalledWith(expect.objectContaining({ id: 34 }));
    await userEvent.click(
      within(staging).getByRole("button", { name: "Draft Rebecca (2026)" })
    );
    expect(handlers.onDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 35 })
    );
  });

  it("keeps the Draft buttons off, with the reason, for everyone else", () => {
    renderDraft({
      detail: circuitLeagueDetail({ status: "DRAFTING" }),
      snapshot: circuitDraftSnapshot({ picks: 1 }),
      gate: { onTheClock: false, canPick: false, reason: "Waiting for blake to pick." }
    });
    const staging = screen.getByRole("region", { name: "Staging" });
    expect(within(staging).getByTestId("circuit-staging-note").textContent).toBe(
      "Waiting for blake to pick. You can draft from here when you're on the clock."
    );
    const draft = within(staging).getByRole("button", { name: "Draft Laura (2026)" });
    expect((draft as HTMLButtonElement).disabled).toBe(true);
    expect(draft.getAttribute("aria-describedby")).toBe("circuit-staging-help");
  });
});

/** The picker at its last step: Best Picture, Laura, ready to confirm. */
function confirmPicker(confirmActions?: ContenderConfirmAction[]): ContenderPickerProps {
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
    confirmActions,
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

  it("puts the contender form in the middle, with Draft, Queue and Stage", async () => {
    const actions = {
      draft: vi.fn(),
      queue: vi.fn(),
      stage: vi.fn()
    };
    renderDraft({
      detail: circuitLeagueDetail({ status: "DRAFTING" }),
      snapshot: live,
      gate: { onTheClock: true, canPick: true, reason: "You're on the clock." },
      picker: confirmPicker([
        { verb: "Draft", onConfirm: actions.draft },
        { verb: "Queue", onConfirm: actions.queue },
        { verb: "Stage", onConfirm: actions.stage }
      ])
    });
    expect(screen.getByRole("heading", { name: "Draft room" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Your pick" })).toBeTruthy();
    expect(screen.getByTestId("circuit-pick-reason").textContent).toBe(
      "You're on the clock."
    );
    const form = screen.getByRole("group", { name: "Choose a contender" });
    expect(form.getAttribute("aria-describedby")).toBe("circuit-pick-reason");
    await userEvent.click(within(form).getByRole("button", { name: "Draft Laura" }));
    await userEvent.click(within(form).getByRole("button", { name: "Queue Laura" }));
    await userEvent.click(within(form).getByRole("button", { name: "Stage Laura" }));
    expect(actions.draft).toHaveBeenCalledTimes(1);
    expect(actions.queue).toHaveBeenCalledTimes(1);
    expect(actions.stage).toHaveBeenCalledTimes(1);
  });

  it("keeps Draft off but the form usable for everyone else", () => {
    renderDraft({
      detail: circuitLeagueDetail({ status: "DRAFTING" }),
      snapshot: live,
      gate: { onTheClock: false, canPick: false, reason: "Waiting for blake to pick." },
      picker: confirmPicker([
        { verb: "Draft", onConfirm: vi.fn(), disabled: true },
        { verb: "Queue", onConfirm: vi.fn() }
      ])
    });
    expect(screen.getByTestId("circuit-pick-reason").textContent).toBe(
      "Waiting for blake to pick."
    );
    const form = screen.getByRole("group", { name: "Choose a contender" });
    expect(
      (within(form).getByRole("button", { name: "Draft Laura" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(
      (within(form).getByRole("button", { name: "Queue Laura" }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
    expect(
      (within(form).getByRole("textbox", { name: "Category" }) as HTMLInputElement)
        .disabled
    ).toBe(false);
  });

  it("shows the history and roster rails, the header clock, Pause and a lost connection", async () => {
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
    const history = screen.getByRole("region", { name: "Draft history" });
    const rows = within(history).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      "1-1avery: Sunset Boulevard (2026)",
      "1-2blake: — (on the clock)",
      "2-1blake: —",
      "2-2avery: —"
    ]);
    expect(rows[1]!.getAttribute("data-active")).toBe("true");
    const roster = screen.getByRole("region", { name: "My roster" });
    expect(within(roster).getByText("Sunset Boulevard (2026)")).toBeTruthy();
    expect(within(roster).getByText("Best Picture")).toBeTruthy();
    expect(document.querySelector(".dr-header")?.textContent).toContain("0:42");
    expect(screen.getByTestId("draft-connection-indicator").textContent).toMatch(
      /Reconnecting/
    );
    await userEvent.click(screen.getByRole("button", { name: "Pause draft" }));
    expect(handlers.onTogglePause).toHaveBeenCalled();
  });

  it("notes the supplemental round and lists its slot in the history", () => {
    renderDraft({
      detail: circuitLeagueDetail({ status: "DRAFTING" }),
      snapshot: circuitDraftSnapshot({ picks: 4, status: "SUPPLEMENTAL" }),
      gate: {
        onTheClock: true,
        canPick: true,
        reason: "You're on the clock for your supplemental pick."
      }
    });
    expect(screen.getByText(/^Supplemental round:/)).toBeTruthy();
    const history = screen.getByRole("region", { name: "Draft history" });
    expect(within(history).getByText("S-1")).toBeTruthy();
  });

  it("shows the board alone once the draft is complete, by player or category", () => {
    renderDraft({
      detail: circuitLeagueDetail({ status: "IN_SEASON" }),
      snapshot: circuitDraftSnapshot()
    });
    expect(screen.getByText(/^The draft is complete/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Staging" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pause draft" })).toBeNull();
    const blake = screen.getByRole("region", { name: "blake" });
    expect(within(blake).getByText("Missed again, so a chip for pick 3")).toBeTruthy();
    expect(within(blake).getByText(/^Supplemental, for pick 3/)).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "By category" }));
    const acting = screen.getByRole("region", { name: "Best Actress" });
    expect(within(acting).getByText("Ingrid Bergman, Gaslight (2026)")).toBeTruthy();
    expect(within(acting).getByText(/avery · From queue/)).toBeTruthy();
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
