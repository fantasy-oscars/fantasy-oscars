import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CircuitDraftScreenProps } from "@/features/circuitLeagues/screens/CircuitDraftScreen";
import { circuitLeagueDetail, circuitSelection } from "./fixtures";

const laura = circuitSelection(34, "Laura");

const o = {
  view: {} as Record<string, unknown>,
  draftSelection: vi.fn(),
  addToQueue: vi.fn(),
  stageSelection: vi.fn()
};
const picker = {
  onPicked: null as ((s: typeof laura) => void) | null,
  pick: vi.fn(),
  startOver: vi.fn(),
  /** The lookup resolves the contender; false makes it fail without one. */
  resolves: true
};

vi.mock("@/auth/context", () => ({
  useAuthContext: () => ({ user: { sub: "5", username: "avery", avatar_key: null } })
}));
vi.mock("@/orchestration/draft/useDraftRoomPreferences", () => ({
  useDraftRoomPreferences: () => ({
    preferences: { soundEnabled: false, rails: {} },
    updatePreferences: vi.fn()
  })
}));
vi.mock("@/orchestration/circuitDraft", () => ({
  useCircuitDraftOrchestration: () => o
}));
vi.mock("@/orchestration/contenders", () => ({
  useContenderPickerOrchestration: (args: { onPicked: (s: typeof laura) => void }) => {
    picker.onPicked = args.onPicked;
    return {
      picking: false,
      picked: null,
      actions: { pick: picker.pick, startOver: picker.startOver }
    };
  }
}));
// The screen is covered on its own; here it only shows the form's actions.
vi.mock("@/features/circuitLeagues/screens/CircuitDraftScreen", () => ({
  CircuitDraftScreen: (props: CircuitDraftScreenProps) => (
    <div>
      {(props.picker?.confirmActions ?? []).map((a) => (
        <button
          key={a.verb}
          type="button"
          disabled={a.disabled}
          data-loading={a.loading ? "true" : "false"}
          onClick={a.onConfirm}
        >
          {a.verb}
        </button>
      ))}
    </div>
  )
}));

const { CircuitDraftPage } = await import("@/app/pages/CircuitDraftPage");

function setView(phase: "lobby" | "live", canPick: boolean) {
  o.view = {
    state: "ready",
    detail: circuitLeagueDetail({
      status: phase === "lobby" ? "INITIALIZED" : "DRAFTING"
    }),
    phase,
    snapshot: null,
    queue: [],
    staged: [],
    canStart: false,
    gate: phase === "live" ? { onTheClock: canPick, canPick, reason: "" } : null,
    canPause: false,
    announcement: ""
  };
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/leagues/3/film-club/seasons/full/4/draft"]}>
      <Routes>
        <Route
          path="/leagues/:leagueId/:leagueSlug/seasons/full/:fullSeasonId/draft"
          element={<CircuitDraftPage />}
        />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  picker.resolves = true;
  picker.pick.mockImplementation(async () => {
    if (picker.resolves) picker.onPicked?.(laura);
  });
  for (const fn of [o.draftSelection, o.addToQueue, o.stageSelection]) {
    fn.mockReset();
    fn.mockResolvedValue(true);
  }
  picker.startOver.mockReset();
});

afterEach(cleanup);

describe("season draft page form", () => {
  it("offers Queue and Stage before the draft, and Draft once it runs", () => {
    setView("lobby", false);
    renderPage();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Queue",
      "Stage"
    ]);
    cleanup();

    setView("live", false);
    renderPage();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Draft",
      "Queue",
      "Stage"
    ]);
    expect(
      (screen.getByRole("button", { name: "Draft" }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("sends the resolved contender where the pressed button says, then clears the form", async () => {
    setView("live", true);
    renderPage();
    for (const [verb, fn] of [
      ["Draft", o.draftSelection],
      ["Queue", o.addToQueue],
      ["Stage", o.stageSelection]
    ] as const) {
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: verb }));
      });
      expect(fn).toHaveBeenCalledWith(laura);
    }
    expect(picker.startOver).toHaveBeenCalledTimes(3);
  });

  it("keeps the choice when the action is refused or the lookup fails", async () => {
    setView("live", true);
    o.draftSelection.mockResolvedValue(false);
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Draft" }));
    });
    expect(o.draftSelection).toHaveBeenCalledWith(laura);
    expect(picker.startOver).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Draft" }).dataset.loading).toBe("false");

    picker.resolves = false;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Stage" }));
    });
    expect(o.stageSelection).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Stage" }).dataset.loading).toBe("false");
  });
});
