import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MantineProvider } from "@ui";
import { CircuitRosterScreen } from "@/features/circuitLeagues/screens/CircuitRosterScreen";
import { CircuitTransactionsScreen } from "@/features/circuitLeagues/screens/CircuitTransactionsScreen";
import { CircuitLeagueScreen } from "@/features/circuitLeagues/screens/CircuitLeagueScreen";
import type { CircuitRosterPicker } from "@/features/circuitLeagues/screens/CircuitRosterScreen";
import type { ContenderPickerProps } from "@/features/contenders/ui/ContenderPicker";
import {
  CIRCUIT_ADD_DROP_PROCESSING_NOTE,
  circuitAddDropTarget
} from "@/decisions/circuitAddDrop";
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

/** The picker with Best Picture's "Night Train" fully chosen. */
function confirmPicker(owner?: CircuitRosterPicker["owner"]): CircuitRosterPicker {
  return {
    ...picker,
    actions: { ...picker.actions, pick: vi.fn() },
    step: "confirm",
    category: { id: 20, name: "Best Picture", kind: "FILM" },
    film: {
      tmdb_id: 1009,
      title: "New Film",
      original_title: null,
      release_date: "2026-05-01",
      release_year: 2026,
      poster_url: null
    },
    owner
  };
}

function renderRoster(input: {
  roster: CircuitRoster | null;
  own?: boolean;
  pending?: CircuitSelectionSummary | null;
  addStatus?: { ok: boolean; message: string } | null;
  picker?: CircuitRosterPicker;
  dropSelectionId?: number | null;
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
      picker={input.picker ?? picker}
      pending={input.pending ?? null}
      dropSelectionId={input.dropSelectionId ?? null}
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
  it("lists picks in one flat list with a Drop button each, beside the picker", () => {
    const handlers = renderRoster({ roster: circuitRoster() });
    expect(screen.getByRole("heading", { name: "Your roster" })).toBeTruthy();
    const list = screen.getByRole("list", { name: "Picks" });
    // No category headings: the pill's icon and name carry the category.
    expect(screen.queryByRole("heading", { name: "Best Picture" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Best Actress" })).toBeNull();
    expect(screen.queryByText("None")).toBeNull();
    expect(
      within(list)
        .getAllByRole("group")
        .map((g) => g.getAttribute("aria-label"))
    ).toEqual([
      "Best Picture: Night Train (2026), 0 points",
      "Best Actress: Ada Lane, Paper Moon (2026), 0 points"
    ]);
    expect(screen.getByText("2 of 16 · 0 pts so far")).toBeTruthy();
    // Without category limits there is no limits line.
    expect(screen.queryByRole("list", { name: "Category limits" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Drop Night Train (2026)" }));
    expect(handlers.onDrop).toHaveBeenCalledWith(
      expect.objectContaining({ selection: expect.objectContaining({ id: 1 }) })
    );
    expect(screen.getByRole("region", { name: "Add a free agent" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Drop to make room" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Category" })).toBeTruthy();
    expect(screen.queryByText(/circuit/i)).toBeNull();
  });

  it("shows each pick's points, gold once it has won, adding up to the total with dropped points", async () => {
    const roster = circuitRoster();
    roster.entries[0]!.points = {
      total: 3,
      by_ceremony: [
        { ceremony_id: 1, ceremony_name: "Northlight Awards", nomination: 1, win: 0 },
        { ceremony_id: 2, ceremony_name: "Harbor Prize", nomination: 0, win: 2 }
      ]
    };
    roster.points_total = 5;
    roster.dropped_points = 2;
    renderRoster({ roster });
    expect(screen.getByText("2 of 16 · 5 pts so far")).toBeTruthy();
    expect(
      screen.getByText("Plus 2 pts from picks dropped earlier in the season.")
    ).toBeTruthy();
    const pill = screen.getByRole("group", {
      name: "Best Picture: Night Train (2026), 3 points"
    });
    expect(pill.className).toContain("is-winner");
    expect(pill.textContent).toContain("+3");
    expect(
      screen.getByRole("group", {
        name: "Best Actress: Ada Lane, Paper Moon (2026), 0 points"
      }).className
    ).not.toContain("is-winner");

    // Focus shows the nominee card with the breakdown, whose total equals the pill.
    fireEvent.focus(pill);
    expect(await screen.findByText("Points for avery")).toBeTruthy();
    expect(screen.getByText("Northlight Awards")).toBeTruthy();
    expect(screen.getByText("Nomination +1")).toBeTruthy();
    expect(screen.getByText("Win +2")).toBeTruthy();
    expect(screen.getByText("Total")).toBeTruthy();
  });

  it("drops by icon with a visible tooltip naming the action", async () => {
    renderRoster({ roster: circuitRoster() });
    const drop = screen.getByRole("button", { name: "Drop Night Train (2026)" });
    expect(drop.textContent).toBe("remove_circle");
    fireEvent.mouseEnter(drop);
    expect(await screen.findByText("Drop")).toBeTruthy();
  });

  it("asks for a drop when the roster is full, with Don't drop anyone listed first", () => {
    renderRoster({ roster: circuitRoster({ rosterSize: 2 }) });
    const select = screen.getByRole("textbox", { name: "Drop to make room" });
    expect(select.getAttribute("placeholder")).toBe("Select a pick to drop");
    fireEvent.click(select);
    const listbox = document.getElementById(select.getAttribute("aria-controls") ?? "")!;
    const options = within(listbox).getAllByRole("option", { hidden: true });
    expect(options.map((o) => o.textContent)).toEqual([
      "Don't drop anyone",
      "Night Train (2026)",
      "Ada Lane, Paper Moon (2026)"
    ]);
  });

  it("offers Don't drop anyone as the placeholder while there is room", () => {
    renderRoster({ roster: circuitRoster() });
    expect(
      screen
        .getByRole("textbox", { name: "Drop to make room" })
        .getAttribute("placeholder")
    ).toBe("Don't drop anyone");
  });

  it("previews the chosen free agent as a pill with an add icon instead of Pick", async () => {
    const chosen = confirmPicker(null);
    renderRoster({ roster: circuitRoster(), picker: chosen, dropSelectionId: 1 });
    expect(screen.queryByRole("button", { name: /^Pick / })).toBeNull();
    expect(
      screen.getByRole("group", { name: "Best Picture: New Film (2026)" })
    ).toBeTruthy();
    const add = screen.getByRole("button", { name: "Add Best Picture: New Film (2026)" });
    fireEvent.mouseEnter(add);
    expect(await screen.findByText("Add, dropping Night Train (2026)")).toBeTruthy();
    fireEvent.click(add);
    expect(chosen.actions.pick).toHaveBeenCalled();
  });

  it("mutes an owned contender and disables its add icon with the owner as the tooltip", async () => {
    const chosen = confirmPicker({ user_id: 6, username: "blake" });
    renderRoster({ roster: circuitRoster(), picker: chosen });
    const pill = screen.getByRole("group", {
      name: "Best Picture: New Film (2026), owned by blake"
    });
    expect(pill.className).toContain("is-muted");
    const add = screen.getByRole("button", { name: "Add Best Picture: New Film (2026)" });
    expect(add.getAttribute("aria-disabled")).toBe("true");
    fireEvent.mouseEnter(add);
    await waitFor(() => expect(screen.getAllByText("Owned by blake")).toHaveLength(2));
    fireEvent.click(add);
    expect(chosen.actions.pick).not.toHaveBeenCalled();
  });

  it("says when the chosen contender is already on the viewer's roster", () => {
    renderRoster({
      roster: circuitRoster(),
      picker: confirmPicker({ user_id: 5, username: "avery" })
    });
    expect(screen.getByText("Already on your roster")).toBeTruthy();
  });

  it("opens the nominee card with points and Drop on a tap on a phone", async () => {
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
      const handlers = renderRoster({ roster: circuitRoster() });
      fireEvent.click(
        screen.getByRole("button", { name: "Best Picture: Night Train (2026), 0 points" })
      );
      const card = await screen.findByRole("dialog", { name: "Nominee details" });
      expect(within(card).getByText("Points for avery")).toBeTruthy();
      expect(within(card).getByText("No points yet.")).toBeTruthy();
      fireEvent.click(within(card).getByRole("button", { name: "Drop" }));
      expect(handlers.onDrop).toHaveBeenCalledWith(
        expect.objectContaining({ selection: expect.objectContaining({ id: 1 }) })
      );
    } finally {
      vi.unstubAllGlobals();
    }
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

  it("lists players in the Player select with avatars and no visible (you)", () => {
    renderRoster({ roster: circuitRoster() });
    const select = screen.getByRole("textbox", { name: "Player" });
    expect((select as HTMLInputElement).value).toBe("avery");
    fireEvent.click(select);
    const listbox = document.getElementById(select.getAttribute("aria-controls") ?? "")!;
    const options = within(listbox).getAllByRole("option", { hidden: true });
    // The viewer's ", you" is visually hidden text; every option has an avatar.
    expect(options.map((o) => o.textContent)).toEqual(["avery, you"]);
    expect(options.every((o) => o.querySelector(".fo-animalAvatar"))).toBe(true);
    expect(listbox.textContent).not.toContain("(you)");
  });

  it("shows the limits line with each limited category's icon and count", () => {
    renderRoster({ roster: circuitRoster({ maxActing: 1 }) });
    const limits = screen.getByRole("list", { name: "Category limits" });
    const items = within(limits).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(within(items[0]!).getByRole("img", { name: "Best Actress" })).toBeTruthy();
    expect(within(items[0]!).getByText("1 of 1")).toBeTruthy();
  });

  it("keeps the limits line on an empty roster", () => {
    renderRoster({ roster: circuitRoster({ maxActing: 2, entries: [] }) });
    expect(screen.getByText("No picks yet.")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Picks" })).toBeNull();
    const limits = screen.getByRole("list", { name: "Category limits" });
    expect(within(limits).getByText("0 of 2")).toBeTruthy();
  });

  it("shows the chosen player's avatar in the Player field", () => {
    renderRoster({ roster: circuitRoster() });
    const select = screen.getByRole("textbox", { name: "Player" });
    const field = select.closest(".mantine-Select-root") ?? select.parentElement!;
    expect(field.querySelector(".fo-animalAvatar")).toBeTruthy();
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
    // Moves stack: the plus line first, then the minus line with a dashed pill.
    // Each icon is named, and each pill's name starts with its move.
    const icons = within(items[0]!).getAllByRole("img");
    expect(icons.map((i) => i.getAttribute("aria-label"))).toEqual(["Added", "Dropped"]);
    expect(icons.every((i) => !i.hasAttribute("tabindex"))).toBe(true);
    const pills = within(items[0]!).getAllByRole("group");
    expect(pills.map((p) => p.getAttribute("aria-label"))).toEqual([
      "Added: Best Picture: New Film (2026)",
      "Dropped: Best Picture: Night Train (2026)"
    ]);
    expect(pills[1]!.className).toContain("is-dropped");
    const time = items[0]!.querySelector("time")!;
    expect(time.getAttribute("dateTime")).toBe("2026-12-03T08:00:00Z");
    expect(time.getAttribute("title")).toBeTruthy();
    expect(items[1]!.textContent).toContain("Drop");
    expect(within(items[1]!).queryByRole("img", { name: "Added" })).toBeNull();
    // A member's link to the roster page says "Your roster", as on the season page.
    expect(screen.getByRole("link", { name: "Your roster" })).toBeTruthy();
    expect(
      within(items[1]!).getByRole("group", {
        name: "Dropped: Best Actress: Ada Lane, Paper Moon (2026)"
      })
    ).toBeTruthy();
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
  function renderLeague(
    status: "SETUP" | "IN_SEASON",
    addDrop: ReturnType<typeof circuitAddDropTarget> | null = null
  ) {
    const detail = circuitLeagueDetail({ status });
    wrap(
      <CircuitLeagueScreen
        addDrop={addDrop}
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

describe("season page Add/drop", () => {
  function renderLeague(addDrop: ReturnType<typeof circuitAddDropTarget> | null) {
    const detail = circuitLeagueDetail({ status: "IN_SEASON" });
    wrap(
      <CircuitLeagueScreen
        addDrop={addDrop}
        view={{
          state: "ready",
          detail,
          settings: fullSeasonSettingsFrom(detail),
          editable: circuitLeagueEditable("IN_SEASON")
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

  it("leads the header group and goes to free agency outside a window", () => {
    renderLeague(
      circuitAddDropTarget({
        freeAgency: { open: true, window: null },
        claims: null
      })
    );
    const header = screen.getByRole("banner");
    const links = within(header).getAllByRole("link");
    expect(links[0]!.textContent).toBe("Add/drop");
    expect(links[0]!.getAttribute("href")).toBe(
      "/leagues/3/film-club/seasons/full/4/roster#add"
    );
    expect(screen.queryByText(CIRCUIT_ADD_DROP_PROCESSING_NOTE)).toBeNull();
  });

  it("goes to claims while a window is open", () => {
    renderLeague(
      circuitAddDropTarget({
        freeAgency: { open: false, window: OPEN_WINDOW },
        claims: { window: OPEN_WINDOW, locked: false }
      })
    );
    expect(screen.getByRole("link", { name: "Add/drop" }).getAttribute("href")).toBe(
      "/leagues/3/film-club/seasons/full/4/waivers#claim"
    );
  });

  it("goes to the waivers page with the processing caption while claims run", () => {
    renderLeague(
      circuitAddDropTarget({
        freeAgency: { open: false, window: OPEN_WINDOW },
        claims: { window: OPEN_WINDOW, locked: true }
      })
    );
    const button = screen.getByRole("link", { name: "Add/drop" });
    expect(button.getAttribute("href")).toBe(
      "/leagues/3/film-club/seasons/full/4/waivers"
    );
    const caption = screen.getByText(CIRCUIT_ADD_DROP_PROCESSING_NOTE);
    expect(caption.getAttribute("role")).toBe("status");
    expect(button.getAttribute("aria-describedby")).toBe(caption.id);
  });

  it("is absent without a destination", () => {
    renderLeague(null);
    expect(screen.queryByRole("link", { name: "Add/drop" })).toBeNull();
  });
});
