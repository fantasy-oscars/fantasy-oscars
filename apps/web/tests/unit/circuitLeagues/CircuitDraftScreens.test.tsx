import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MantineProvider } from "@ui";
import { Notifications } from "@ui/notifications";
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

type DraftInput = {
  detail?: CircuitLeagueDetail;
  snapshot?: CircuitDraftSnapshot | null;
  queue?: boolean;
  canStart?: boolean;
  startBlockedLine?: string | null;
  gate?: CircuitPickGate | null;
  canPause?: boolean;
  picker?: ContenderPickerProps | null;
  connectionState?: DraftConnectionState;
};

function renderDraft(input: DraftInput) {
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
  const view = render(draftRoom(input, handlers));
  return {
    ...handlers,
    /** The same room with a newer snapshot or gate, keeping its state. */
    rerender: (next: DraftInput) =>
      view.rerender(draftRoom({ ...input, ...next }, handlers))
  };
}

function draftRoom(
  input: DraftInput,
  handlers: Omit<
    ComponentProps<typeof CircuitDraftScreen>,
    | "view"
    | "viewerUserId"
    | "viewerLabel"
    | "viewerAvatarKey"
    | "picker"
    | "connection"
    | "connectionState"
    | "clock"
    | "pickStatus"
    | "picking"
    | "pauseStatus"
    | "queueBusy"
    | "removingSelectionId"
    | "queueStatus"
    | "startStatus"
    | "soundEnabled"
    | "railPreferences"
  >
) {
  const detail = input.detail ?? circuitLeagueDetail({ status: "INITIALIZED" });
  const snapshot = input.snapshot ?? null;
  return (
    <MantineProvider>
      <Notifications />
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
            startBlockedLine: input.startBlockedLine ?? null,
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

describe("circuit draft lobby before the season goes live", () => {
  const LINE = "Opens when the season goes live";

  it("shows the commissioner a disabled Start draft and the line, with the queue usable", () => {
    const handlers = renderDraft({ startBlockedLine: LINE });
    const start = screen.getByRole("button", { name: "Start draft" });
    expect(start.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(start);
    expect(handlers.onStart).not.toHaveBeenCalled();
    expect(screen.getByRole("note").textContent).toBe(LINE);
    const staging = screen.getByRole("region", { name: "Staging" });
    expect(within(staging).getByRole("list", { name: "Your queue" })).toBeTruthy();
  });

  it("shows a player the same line and no Start draft", () => {
    renderDraft({
      detail: circuitLeagueDetail({
        status: "INITIALIZED",
        viewer: { can_manage: false }
      }),
      canStart: false,
      startBlockedLine: LINE
    });
    expect(screen.queryByRole("button", { name: "Start draft" })).toBeNull();
    expect(screen.getByRole("note").textContent).toBe(LINE);
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

  const onTheClock = {
    detail: circuitLeagueDetail({ status: "DRAFTING" }),
    snapshot: circuitDraftSnapshot({ picks: 3 }),
    gate: { onTheClock: true, canPick: true, reason: "You're on the clock." }
  };
  const pill = (name: string) =>
    within(screen.getByRole("region", { name: "Staging" })).getByRole("button", {
      name
    });

  it("lays each contender on one line as a pill, with no Draft buttons", () => {
    renderDraft(onTheClock);
    const staging = screen.getByRole("region", { name: "Staging" });
    expect(within(staging).getByTestId("circuit-staging-note").textContent).toBe(
      "You're on the clock. Double-click a contender to draft it, or select it and confirm."
    );
    expect(within(staging).queryByRole("button", { name: /^Draft / })).toBeNull();
    const laura = pill("Best Picture: Laura (2026)");
    expect(laura.classList.contains("dr-pill")).toBe(true);
    expect(laura.querySelector(".dr-pill-icon")).not.toBeNull();
    expect(laura.getAttribute("aria-keyshortcuts")).toBe(
      "Enter Space Shift+Enter Escape"
    );
    expect(laura.getAttribute("aria-describedby")).toBe("circuit-staging-help");
    // A drafted contender stays listed, muted, named with who drafted it.
    const drafted = pill("Best Picture: Sunset Boulevard (2026), drafted by avery");
    expect(drafted.classList.contains("is-muted")).toBe(true);
    expect(drafted.getAttribute("aria-disabled")).toBe("true");
  });

  it("arms a pill on click and drafts it on double-click", async () => {
    const handlers = renderDraft(onTheClock);
    const laura = pill("Best Picture: Laura (2026)");
    fireEvent.click(laura);
    expect(laura.getAttribute("aria-pressed")).toBe("true");
    expect(laura.classList.contains("is-armed")).toBe(true);
    // A second click disarms.
    fireEvent.click(laura);
    expect(laura.getAttribute("aria-pressed")).toBe("false");
    fireEvent.doubleClick(pill("Best Picture: Rebecca (2026)"));
    expect(handlers.onDraft).toHaveBeenCalledTimes(1);
    expect(handlers.onDraft).toHaveBeenCalledWith(expect.objectContaining({ id: 35 }));
  });

  it("raises the confirm toast for an armed pill, which drafts it", async () => {
    const handlers = renderDraft(onTheClock);
    fireEvent.click(pill("Best Picture: Laura (2026)"));
    const toast = await screen.findByText("Confirm draft pick");
    expect(screen.getByText("Draft “Laura (2026)”")).toBeTruthy();
    fireEvent.click(toast);
    expect(handlers.onDraft).toHaveBeenCalledWith(expect.objectContaining({ id: 34 }));
  });

  it("arms with Enter, cancels with Escape and drafts with Shift+Enter", async () => {
    const user = userEvent.setup();
    const handlers = renderDraft(onTheClock);
    const laura = pill("Best Picture: Laura (2026)");
    laura.focus();
    await user.keyboard("{Enter}");
    expect(laura.getAttribute("aria-pressed")).toBe("true");
    expect(laura.getAttribute("aria-describedby")).toBe("circuit-stage-hint-34");
    expect(screen.getByText(/^Selected\. Press Shift\+Enter to draft/)).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(laura.getAttribute("aria-pressed")).toBe("false");
    await user.keyboard(" ");
    expect(laura.getAttribute("aria-pressed")).toBe("true");
    expect(handlers.onDraft).not.toHaveBeenCalled();
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(handlers.onDraft).toHaveBeenCalledWith(expect.objectContaining({ id: 34 }));
  });

  it("clears the selection, and says so, when the armed contender is drafted", () => {
    const room = renderDraft(onTheClock);
    fireEvent.click(pill("Best Picture: Laura (2026)"));
    expect(pill("Best Picture: Laura (2026)").getAttribute("aria-pressed")).toBe("true");
    // Laura goes to pick 4 (from the queue, when the clock ran out).
    const base = circuitDraftSnapshot({ picks: 4 });
    const drafted: CircuitDraftSnapshot = {
      ...base,
      picks: base.picks.map((p) =>
        p.pick_number === 4 ? { ...p, selection_id: 34 } : p
      ),
      selections: [
        ...base.selections.filter((x) => x.id !== 33),
        circuitSelection(34, "Laura")
      ]
    };
    room.rerender({
      snapshot: drafted,
      gate: { onTheClock: false, canPick: false, reason: "Waiting for blake to pick." }
    });
    expect(
      screen.getByText("Selection cleared: Laura (2026) is no longer available")
    ).toBeTruthy();
    expect(
      pill("Best Picture: Laura (2026), drafted by avery").getAttribute("aria-pressed")
    ).toBe("false");
  });

  it("offers Draft first in the row menu while the viewer is on the clock", async () => {
    const handlers = renderDraft(onTheClock);
    await openRowMenu("Laura (2026)");
    const items = screen.getAllByRole("menuitem", { hidden: true });
    expect(items[0]!.textContent).toBe("Draft");
    fireEvent.click(menuItem("Draft"));
    expect(handlers.onDraft).toHaveBeenCalledWith(expect.objectContaining({ id: 34 }));
  });

  it("offers only Remove for a drafted contender", async () => {
    renderDraft(onTheClock);
    await openRowMenu("Sunset Boulevard (2026)");
    expect(
      screen.getAllByRole("menuitem", { hidden: true }).map((i) => i.textContent)
    ).toEqual(["Remove from queue"]);
  });

  it("keeps the pills from drafting, with the reason, for everyone else", async () => {
    const handlers = renderDraft({
      detail: circuitLeagueDetail({ status: "DRAFTING" }),
      snapshot: circuitDraftSnapshot({ picks: 1 }),
      gate: { onTheClock: false, canPick: false, reason: "Waiting for blake to pick." }
    });
    const staging = screen.getByRole("region", { name: "Staging" });
    expect(within(staging).getByTestId("circuit-staging-note").textContent).toBe(
      "Waiting for blake to pick. You can draft from here when you're on the clock."
    );
    const laura = pill("Best Picture: Laura (2026)");
    expect(laura.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(laura);
    fireEvent.doubleClick(laura);
    expect(laura.getAttribute("aria-pressed")).toBe("false");
    expect(handlers.onDraft).not.toHaveBeenCalled();
    await openRowMenu("Laura (2026)");
    expect(screen.queryByRole("menuitem", { name: "Draft", hidden: true })).toBeNull();
  });

  it("opens the nominee card with Draft, Move and Remove on a phone", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(pointer: coarse)",
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false
    }));
    try {
      const handlers = renderDraft(onTheClock);
      expect(screen.getByTestId("circuit-staging-note").textContent).toBe(
        "You're on the clock. Tap a contender, then Draft."
      );
      const laura = pill("Best Picture: Laura (2026)");
      expect(laura.getAttribute("aria-haspopup")).toBe("dialog");
      fireEvent.click(laura);
      const card = await screen.findByRole("dialog", { name: "Nominee details" });
      expect(
        within(card)
          .getAllByRole("button")
          .map((b) => b.getAttribute("aria-label") ?? b.textContent)
      ).toEqual(["Close", "Draft", "Move to staged", "Remove"]);
      fireEvent.click(within(card).getByRole("button", { name: "Draft" }));
      expect(handlers.onDraft).toHaveBeenCalledWith(expect.objectContaining({ id: 34 }));
    } finally {
      vi.unstubAllGlobals();
    }
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

  it("previews the contender as a pill, muted with its owner once drafted", () => {
    const picker = confirmPicker([{ verb: "Draft", onConfirm: vi.fn() }]);
    renderDraft({
      detail: circuitLeagueDetail({ status: "DRAFTING" }),
      snapshot: circuitDraftSnapshot({ picks: 2 }),
      gate: { onTheClock: false, canPick: false, reason: "Waiting for blake to pick." },
      picker: {
        ...picker,
        film: {
          tmdb_id: 1032,
          title: "All About Eve",
          release_year: 2026,
          poster_url: null
        }
      }
    });
    const form = screen.getByRole("group", { name: "Choose a contender" });
    const preview = within(form).getByRole("group", {
      name: "Best Picture: All About Eve (2026), owned by blake"
    });
    expect(preview.classList.contains("is-muted")).toBe(true);
    expect(within(form).getByText("Owned by blake")).toBeTruthy();
    cleanup();

    renderDraft({
      detail: circuitLeagueDetail({ status: "DRAFTING" }),
      snapshot: live,
      gate: { onTheClock: true, canPick: true, reason: "You're on the clock." },
      picker
    });
    const free = screen.getByRole("group", { name: "Best Picture: Laura (1944)" });
    expect(free.classList.contains("is-muted")).toBe(false);
    expect(free.querySelector(".dr-pill-icon")).not.toBeNull();
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
      "1-1movieSunset Boulevard (2026)",
      "1-2blake: — (on the clock)",
      "2-1blake: —",
      "2-2avery: —"
    ]);
    expect(rows[1]!.getAttribute("data-active")).toBe("true");
    // A drafted slot's pill carries the category icon and names who drafted it.
    const drafted = within(rows[0]!).getByRole("group", {
      name: "Best Picture: Sunset Boulevard (2026), drafted by avery"
    });
    expect(drafted.querySelector(".dr-pill-icon")).not.toBeNull();
    const roster = screen.getByRole("region", { name: "My roster" });
    expect(
      within(roster).getByRole("group", { name: "Best Picture: Sunset Boulevard (2026)" })
    ).toBeTruthy();
    // The icon names the category: no category line under the pill.
    expect(within(roster).queryByText("Best Picture")).toBeNull();
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
    // blake missed pick 3 twice: the slot is simply absent, with no notes.
    const blake = screen.getByRole("region", { name: "blake" });
    expect(blake.textContent).toContain("1 of 2");
    expect(
      within(blake).getByRole("group", { name: "Best Picture: All About Eve (2026)" })
    ).toBeTruthy();
    expect(within(blake).queryByText(/Missed|Supplemental|From queue/)).toBeNull();
    const avery = screen.getByRole("region", { name: "avery (you)" });
    expect(avery.textContent).toContain("2 of 2");

    fireEvent.click(screen.getByRole("radio", { name: "By category" }));
    const acting = screen.getByRole("region", { name: "Best Actress" });
    expect(
      within(acting).getByRole("group", {
        name: "Best Actress: Ingrid Bergman, Gaslight (2026), drafted by avery"
      })
    ).toBeTruthy();
    expect(within(acting).getByText("2-2")).toBeTruthy();
    expect(within(acting).queryByText(/From queue/)).toBeNull();
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
