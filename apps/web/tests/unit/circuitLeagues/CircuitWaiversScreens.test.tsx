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
import { CircuitWaiversScreen } from "@/features/circuitLeagues/screens/CircuitWaiversScreen";
import { circuitPendingClaims } from "@/decisions/circuitWaivers";
import type { CircuitClaims, CircuitWaiverRun, CircuitWaivers } from "@/lib/types";
import type { CircuitClaimDraft } from "@/orchestration/circuitWaivers";
import type { CircuitSeasonPicker } from "@/features/circuitLeagues/ui/ContenderPreviewRow";
import {
  circuitLeagueDetail,
  circuitRoster,
  circuitSelection,
  OPEN_WINDOW
} from "./fixtures";

afterEach(cleanup);

const nightTrain = circuitSelection(1, "Night Train");
const paperMoon = circuitSelection(2, "Paper Moon", "Ada Lane");
const harbor = circuitSelection(3, "Harbor");
const quietSea = circuitSelection(4, "Quiet Sea", "Bea Moss");

const waivers: CircuitWaivers = {
  window: OPEN_WINDOW,
  priority: [
    { user_id: 5, username: "avery", waiver_priority: 2 },
    { user_id: 6, username: "blake", waiver_priority: 1 }
  ],
  chips: [
    {
      id: 31,
      member: { user_id: 5, username: "avery" },
      original_pick_number: 3,
      status: "AVAILABLE"
    }
  ]
};

function claimsFixture(overrides: Partial<CircuitClaims> = {}): CircuitClaims {
  return {
    window: OPEN_WINDOW,
    locked: false,
    claims: [
      {
        id: 8,
        rank: 1,
        status: "PENDING",
        failure_reason: null,
        selection: harbor,
        drop: nightTrain,
        chip: { id: 31, original_pick_number: 3 },
        created_at: "2027-01-08T09:00:00Z",
        updated_at: "2027-01-08T09:00:00Z"
      },
      {
        id: 9,
        rank: 2,
        status: "PENDING",
        failure_reason: null,
        selection: quietSea,
        drop: null,
        chip: null,
        created_at: "2027-01-08T10:00:00Z",
        updated_at: "2027-01-08T10:00:00Z"
      }
    ],
    chips: [{ id: 31, original_pick_number: 3, status: "AVAILABLE", claim_id: 8 }],
    ...overrides
  };
}

const run: CircuitWaiverRun = {
  id: 70,
  window: { starts_on: "2027-01-01", ends_on: "2027-01-03" },
  completed_at: "2027-01-04T08:00:10Z",
  priority_before: [],
  priority_after: [
    { user_id: 6, username: "blake", waiver_priority: 1 },
    { user_id: 5, username: "avery", waiver_priority: 2 }
  ],
  claims: [
    {
      id: 1,
      order: 1,
      member: { user_id: 5, username: "avery" },
      status: "WON",
      failure_reason: null,
      selection: paperMoon,
      drop: null,
      chip: { original_pick_number: 2 }
    },
    {
      id: 2,
      order: 2,
      member: { user_id: 6, username: "blake" },
      status: "LOST",
      failure_reason: "SELECTION_OWNED",
      selection: paperMoon,
      drop: nightTrain,
      chip: null
    }
  ]
};

function renderWaivers(
  input: {
    claims?: CircuitClaims | null;
    isMember?: boolean;
    draft?: CircuitClaimDraft | null;
    warning?: string | null;
    dropError?: string | null;
    runs?: CircuitWaiverRun[];
    picker?: CircuitSeasonPicker | null;
    phone?: boolean;
  } = {}
) {
  const claims = input.claims === undefined ? claimsFixture() : input.claims;
  const handlers = {
    onReorder: vi.fn(),
    onEdit: vi.fn(),
    onWithdraw: vi.fn(),
    onChangeDraft: vi.fn(),
    onCloseClaim: vi.fn(),
    onSaveClaim: vi.fn()
  };
  render(
    <MantineProvider>
      <MemoryRouter>
        <CircuitWaiversScreen
          view={{
            state: "ready",
            detail: circuitLeagueDetail({
              status: "IN_SEASON",
              viewer: { is_member: input.isMember ?? true }
            }),
            waivers,
            runs: input.runs ?? [run],
            claims,
            pending: claims ? circuitPendingClaims(claims) : [],
            canClaim: claims !== null && claims.window !== null && !claims.locked
          }}
          viewerUserId={5}
          picker={input.picker ?? null}
          phone={input.phone ?? false}
          draft={input.draft ?? null}
          dropOptions={circuitRoster().entries}
          chipOptions={[]}
          warning={input.warning ?? null}
          dropError={input.dropError ?? null}
          saving={false}
          busy={false}
          modalStatus={null}
          listStatus={null}
          {...handlers}
        />
      </MemoryRouter>
    </MantineProvider>
  );
  return handlers;
}

describe("CircuitWaiversScreen", () => {
  it("lists the viewer's claims as pills with their drop pill and chip", async () => {
    const handlers = renderWaivers();
    const list = screen.getByRole("list", { name: "Your claims" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Harbor (2026)dropping");
    expect(rows[0]).toHaveTextContent("Night Train (2026)· Pick 3 chip");
    expect(rows[0]).not.toHaveTextContent("in Best Picture");
    expect(rows[1]).toHaveTextContent("No drop");
    const drop = within(rows[0]).getByRole("group", {
      name: "Best Picture: Night Train (2026), dropped if the claim wins"
    });
    expect(drop.className).toContain("is-dropped");
    // The category is the icon: every pill draws one.
    expect(rows[0].querySelectorAll(".dr-pill .dr-pill-icon")).toHaveLength(2);

    // A click on the claim pill edits it, as Edit does.
    fireEvent.click(
      within(rows[0]).getByRole("button", { name: "Best Picture: Harbor (2026)" })
    );
    expect(handlers.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 8 }));

    fireEvent.click(screen.getByRole("button", { name: "Move Harbor (2026) down" }));
    expect(handlers.onReorder).toHaveBeenCalledWith([9, 8]);
    const edit = screen.getByRole("button", {
      name: "Edit your claim for Harbor (2026)"
    });
    fireEvent.mouseEnter(edit);
    expect(await screen.findByText("Edit claim")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Withdraw your claim for Bea Moss, Quiet Sea (2026)"
      })
    );
    expect(handlers.onWithdraw).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }));
    expect(
      screen.getByText(/run at midnight Pacific on Jan 11, 2027/)
    ).toBeInTheDocument();
  });

  it("folds a claim's actions into one menu on a phone", async () => {
    const handlers = renderWaivers({ phone: true });
    expect(
      screen.queryByRole("button", { name: "Edit your claim for Harbor (2026)" })
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: "More actions for your claim for Harbor (2026)"
      })
    );
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual([
      "Move up",
      "Move down",
      "Edit claim",
      "Withdraw"
    ]);
    expect(items[0]).toBeDisabled();
    fireEvent.click(items[1]);
    expect(handlers.onReorder).toHaveBeenCalledWith([9, 8]);
  });

  it("freezes the claims while the window is processed", () => {
    renderWaivers({ claims: claimsFixture({ locked: true }) });
    expect(screen.getByText(/being processed/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit your claim for Harbor (2026)" })
    ).toBeDisabled();
    // The claim pills stay, read-only: no longer a button that edits.
    expect(
      screen.queryByRole("button", { name: "Best Picture: Harbor (2026)" })
    ).toBeNull();
    expect(
      screen.getByRole("group", { name: "Best Picture: Harbor (2026)" })
    ).toBeTruthy();
  });

  it("disables a phone row's menu while the window is processed", () => {
    renderWaivers({ phone: true, claims: claimsFixture({ locked: true }) });
    expect(
      screen.getByRole("button", {
        name: "More actions for your claim for Harbor (2026)"
      })
    ).toBeDisabled();
  });

  it("explains that there is no window, and shows no claims to a non-player", () => {
    renderWaivers({ claims: claimsFixture({ window: null, claims: [] }) });
    expect(screen.getByText(/There is no waiver window open/)).toBeInTheDocument();
    cleanup();
    renderWaivers({ claims: null, isMember: false });
    expect(screen.queryByRole("list", { name: "Your claims" })).toBeNull();
    expect(screen.getByText(/you have no claims/)).toBeInTheDocument();
  });

  it("shows priority with chips, and each run's claims in order", () => {
    renderWaivers();
    const priority = within(screen.getByRole("list", { name: "Waiver priority" }))
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(priority[0]).toContain("blake");
    expect(priority[1]).toContain("avery (you)");
    expect(priority[1]).toContain("Pick 3 chip: Available");
    expect(
      screen
        .getByRole("list", { name: "Waiver priority" })
        .querySelectorAll("li .fo-animalAvatar").length
    ).toBeGreaterThan(0);

    const results = within(
      screen.getByRole("list", {
        name: "Claims for Jan 1, 2027 to Jan 3, 2027, in the order they ran"
      })
    ).getAllByRole("listitem");
    // Line one: order, name and the outcome beside it; line two: the pills.
    expect(results[0]).toHaveTextContent("1.averyWon · Pick 2 chip");
    expect(results[1]).toHaveTextContent("2.blakeLost: Someone ahead of them got it");
    const won = within(results[0]).getByRole("group", {
      name: "Best Actress: Ada Lane, Paper Moon (2026)"
    });
    expect(won.className).not.toContain("is-muted");
    const lost = within(results[1]).getByRole("group", {
      name: "Best Actress: Ada Lane, Paper Moon (2026), lost"
    });
    expect(lost.className).toContain("is-muted");
    expect(results[1]).toHaveTextContent("dropping");
    expect(
      within(results[1]).getByRole("group", {
        name: "Best Picture: Night Train (2026), dropped"
      }).className
    ).toContain("is-dropped");
    expect(screen.getByText("Priority after: blake, avery")).toBeInTheDocument();
  });

  it("says when no claims have run yet", () => {
    renderWaivers({ runs: [] });
    expect(screen.getByText(/No claims have run yet/)).toBeInTheDocument();
  });

  it("opens the claim modal with the drop, the capacity warning and the chip", () => {
    const handlers = renderWaivers({
      draft: {
        claimId: null,
        selection: harbor,
        dropSelectionId: null,
        noDrop: false,
        chipId: null
      },
      warning: "Your roster is full. Without a drop, this claim fails."
    });
    const dialog = screen.getByRole("dialog", { name: "Claim Harbor (2026)" });
    expect(
      within(dialog).getByRole("group", { name: "Best Picture: Harbor (2026)" })
    ).toBeTruthy();
    expect(within(dialog).getByText(/Your roster is full/)).toBeInTheDocument();
    expect(
      within(dialog).getByRole("textbox", { name: "Drop if this claim wins" })
    ).toHaveAttribute("placeholder", "Select a pick to drop");
    expect(within(dialog).getByRole("textbox", { name: "Chip" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "File claim" }));
    expect(handlers.onSaveClaim).toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(handlers.onCloseClaim).toHaveBeenCalled();
  });

  it("keeps a full roster's claim unfiled until a drop or no drop is chosen", () => {
    const handlers = renderWaivers({
      draft: {
        claimId: null,
        selection: harbor,
        dropSelectionId: null,
        noDrop: false,
        chipId: null
      },
      dropError: "Your roster is full. Choose a pick to drop, or Don't drop anyone."
    });
    const dialog = screen.getByRole("dialog", { name: "Claim Harbor (2026)" });
    expect(within(dialog).queryByText(/Choose a pick to drop/)).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "File claim" }));
    expect(within(dialog).getByText(/Choose a pick to drop/)).toBeInTheDocument();
    expect(handlers.onSaveClaim).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole("textbox", { name: "Drop if this claim wins" })
    );
    fireEvent.click(screen.getByRole("option", { name: "Don't drop anyone" }));
    expect(handlers.onChangeDraft).toHaveBeenCalledWith({
      dropSelectionId: null,
      noDrop: true
    });
  });

  it("shows a saved no-drop choice when editing, not the placeholder", () => {
    renderWaivers({
      draft: {
        claimId: 9,
        selection: harbor,
        dropSelectionId: null,
        noDrop: true,
        chipId: null
      }
    });
    const dialog = screen.getByRole("dialog", { name: "Your claim for Harbor (2026)" });
    expect(
      within(dialog).getByRole("textbox", { name: "Drop if this claim wins" })
    ).toHaveValue("Don't drop anyone");
    expect(
      within(dialog).queryByRole("group", { name: /dropped if the claim wins/ })
    ).toBeNull();
  });

  it("echoes the chosen drop under its select as a dashed pill", () => {
    renderWaivers({
      draft: {
        claimId: 8,
        selection: harbor,
        dropSelectionId: 1,
        noDrop: false,
        chipId: null
      }
    });
    const dialog = screen.getByRole("dialog", { name: "Your claim for Harbor (2026)" });
    expect(
      within(dialog).getByRole("group", {
        name: "Best Picture: Night Train (2026), dropped if the claim wins"
      }).className
    ).toContain("is-dropped");
  });

  it("previews the chosen contender with a claim icon, disabled while it is owned", async () => {
    const pick = vi.fn();
    const chosen = (owner?: CircuitSeasonPicker["owner"]): CircuitSeasonPicker => ({
      categoriesState: "ready",
      categoriesError: null,
      categories: [{ id: 20, name: "Best Picture", kind: "FILM" }],
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
        pick,
        startOver: vi.fn()
      },
      owner
    });
    renderWaivers({ picker: chosen(null) });
    expect(screen.queryByRole("button", { name: /^Pick / })).toBeNull();
    const claim = screen.getByRole("button", {
      name: "Claim Best Picture: New Film (2026)"
    });
    fireEvent.mouseEnter(claim);
    expect(await screen.findByText("Claim")).toBeTruthy();
    fireEvent.click(claim);
    expect(pick).toHaveBeenCalledTimes(1);

    cleanup();
    renderWaivers({ picker: chosen({ user_id: 6, username: "blake" }) });
    expect(
      screen.getByRole("group", { name: "Best Picture: New Film (2026), owned by blake" })
        .className
    ).toContain("is-muted");
    const held = screen.getByRole("button", {
      name: "Claim Best Picture: New Film (2026)"
    });
    expect(held.getAttribute("aria-disabled")).toBe("true");
    fireEvent.mouseEnter(held);
    await waitFor(() => expect(screen.getAllByText("Owned by blake")).toHaveLength(2));
    fireEvent.click(held);
    expect(pick).toHaveBeenCalledTimes(1);
  });
});
