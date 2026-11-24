import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MantineProvider } from "@ui";
import { CircuitRosterScreen } from "@/features/circuitLeagues/screens/CircuitRosterScreen";
import { CircuitTransactionsScreen } from "@/features/circuitLeagues/screens/CircuitTransactionsScreen";
import { CircuitLeagueScreen } from "@/features/circuitLeagues/screens/CircuitLeagueScreen";
import type { ContenderPickerProps } from "@/features/contenders/ui/ContenderPicker";
import { circuitLeagueEditable } from "@/decisions/circuitLeague";
import { fullSeasonSettingsFrom } from "@/decisions/fullSeasonSettings";
import { circuitFreeAgencyNote } from "@/decisions/circuitRoster";
import type { CircuitRoster, CircuitSelectionSummary } from "@/lib/types";
import {
  circuitLeagueDetail,
  circuitRoster,
  circuitSelection,
  OPEN_WINDOW
} from "./fixtures";

afterEach(cleanup);

function wrap(node: React.ReactNode) {
  return render(
    <MantineProvider>
      <MemoryRouter>{node}</MemoryRouter>
    </MantineProvider>
  );
}

const picker: ContenderPickerProps = {
  categoriesState: "ready",
  categoriesError: null,
  categories: [{ id: 20, name: "Best Picture", kind: "FILM" }],
  step: "category",
  category: null,
  film: null,
  person: null,
  search: { query: "", hint: null, state: "idle", error: null, results: [] },
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

function renderRoster(input: {
  roster: CircuitRoster | null;
  own?: boolean;
  pending?: CircuitSelectionSummary | null;
  addStatus?: { ok: boolean; message: string } | null;
}) {
  const own = input.own ?? true;
  const handlers = {
    onSelectMember: vi.fn(),
    onChooseDrop: vi.fn(),
    onRetryAdd: vi.fn(),
    onCancelAdd: vi.fn(),
    onDrop: vi.fn()
  };
  const detail = circuitLeagueDetail({ status: "IN_SEASON" });
  wrap(
    <CircuitRosterScreen
      view={{
        state: "ready",
        detail,
        roster: input.roster,
        own,
        writable: own && input.roster !== null,
        freeAgencyNote: input.roster
          ? circuitFreeAgencyNote(input.roster.free_agency)
          : null
      }}
      memberUserId={own ? null : 6}
      viewerUserId={5}
      picker={picker}
      pending={input.pending ?? null}
      dropSelectionId={null}
      dropOptions={input.roster && own ? input.roster.entries : []}
      adding={false}
      droppingSelectionId={null}
      addStatus={input.addStatus ?? null}
      dropStatus={null}
      {...handlers}
    />
  );
  return handlers;
}

describe("circuit roster screen", () => {
  it("lists picks by category with a Drop button each, beside the picker", () => {
    const handlers = renderRoster({ roster: circuitRoster() });
    expect(screen.getByRole("heading", { name: "Your roster" })).toBeTruthy();
    const picture = screen.getByRole("region", { name: "Best Picture" });
    expect(within(picture).getByText("Night Train (2026)")).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: "Best Actress" })).getByText(
        "Ada Lane, Paper Moon (2026)"
      )
    ).toBeTruthy();
    expect(screen.getByText("2 of 16")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Drop Night Train (2026)" }));
    expect(handlers.onDrop).toHaveBeenCalledWith(
      expect.objectContaining({ selection: expect.objectContaining({ id: 1 }) })
    );
    expect(screen.getByRole("region", { name: "Add a free agent" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Drop to make room" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Category" })).toBeTruthy();
    expect(screen.queryByText(/circuit/i)).toBeNull();
  });

  it("hides the picker inside a waiver window and says when free agency reopens", () => {
    renderRoster({
      roster: circuitRoster({ freeAgency: { open: false, window: OPEN_WINDOW } })
    });
    expect(screen.getByRole("status").textContent).toContain(
      "reopens at midnight Pacific on Jan 11, 2027"
    );
    expect(screen.queryByRole("textbox", { name: "Category" })).toBeNull();
    // Drops stay open inside a window.
    expect(screen.getByRole("button", { name: "Drop Night Train (2026)" })).toBeTruthy();
  });

  it("offers to retry or cancel a pick that needs a drop", () => {
    const handlers = renderRoster({
      roster: circuitRoster({ rosterSize: 2 }),
      pending: circuitSelection(9, "New Film"),
      addStatus: { ok: false, message: "Your roster is full. Choose a pick to drop." }
    });
    expect(screen.getByText("Your roster is full. Choose a pick to drop.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add New Film (2026)" }));
    expect(handlers.onRetryAdd).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(handlers.onCancelAdd).toHaveBeenCalled();
  });

  it("keeps the retry for a pending pick once a drop clears the error", () => {
    const handlers = renderRoster({
      roster: circuitRoster({ rosterSize: 2 }),
      pending: circuitSelection(9, "New Film"),
      addStatus: null
    });
    expect(screen.queryByText("Your roster is full. Choose a pick to drop.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add New Film (2026)" }));
    expect(handlers.onRetryAdd).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("shows another player's roster read-only", () => {
    renderRoster({
      roster: { ...circuitRoster(), member: { user_id: 6, username: "blake" } },
      own: false
    });
    expect(screen.getByRole("heading", { name: "blake's roster" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Drop / })).toBeNull();
    expect(screen.queryByRole("region", { name: "Add a free agent" })).toBeNull();
  });

  it("explains that a player who has not joined has no roster", () => {
    renderRoster({ roster: null });
    expect(screen.getByText(/You have not joined this season/)).toBeTruthy();
  });
});

describe("circuit transaction log screen", () => {
  it("lists who did what, newest first, with the added and dropped picks", () => {
    wrap(
      <CircuitTransactionsScreen
        view={{
          state: "ready",
          detail: circuitLeagueDetail({ status: "IN_SEASON" }),
          transactions: [
            {
              id: 4,
              kind: "FREE_AGENT",
              occurred_at: "2026-12-03T08:00:00Z",
              member: { user_id: 5, username: "avery" },
              add: circuitSelection(9, "New Film"),
              drop: circuitSelection(1, "Night Train")
            },
            {
              id: 3,
              kind: "DROP",
              occurred_at: "2026-12-02T08:00:00Z",
              member: { user_id: 6, username: "blake" },
              add: null,
              drop: circuitSelection(2, "Paper Moon", "Ada Lane")
            }
          ]
        }}
      />
    );
    const items = within(screen.getByRole("list", { name: "Transactions" })).getAllByRole(
      "listitem"
    );
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain("avery");
    expect(items[0]!.textContent).toContain("Free agent");
    expect(items[0]!.textContent).toContain("Added New Film (2026) in Best Picture");
    expect(items[0]!.textContent).toContain("Dropped Night Train (2026) in Best Picture");
    expect(items[1]!.textContent).toContain("Drop");
    expect(items[1]!.textContent).not.toContain("Added");
  });

  it("says when there are no transactions yet", () => {
    wrap(
      <CircuitTransactionsScreen
        view={{
          state: "ready",
          detail: circuitLeagueDetail({ status: "IN_SEASON" }),
          transactions: []
        }}
      />
    );
    expect(screen.getByText("No transactions yet.")).toBeTruthy();
  });
});

describe("circuit league screen links", () => {
  function renderLeague(status: "SETUP" | "IN_SEASON") {
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

  it("links to the roster and transactions once the season is under way", () => {
    renderLeague("IN_SEASON");
    expect(screen.getByRole("link", { name: "Your roster" }).getAttribute("href")).toBe(
      "/leagues/3/film-club/seasons/full/4/roster"
    );
    expect(screen.getByRole("link", { name: "Transactions" }).getAttribute("href")).toBe(
      "/leagues/3/film-club/seasons/full/4/transactions"
    );
  });

  it("has no roster links during setup", () => {
    renderLeague("SETUP");
    expect(screen.queryByRole("link", { name: "Your roster" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Transactions" })).toBeNull();
  });
});
