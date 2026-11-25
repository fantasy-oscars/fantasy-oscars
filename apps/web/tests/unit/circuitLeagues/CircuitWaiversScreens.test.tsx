import {
  act,
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
  it("lists the viewer's claims as stacked moves with their pass", async () => {
    const handlers = renderWaivers();
    const list = screen.getByRole("list", { name: "Your claims" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    // The claim's plus line, then the minus line of the drop if it wins.
    expect(
      within(rows[0]!)
        .getAllByRole("img")
        .map((i) => i.getAttribute("aria-label"))
    ).toEqual(["Claim", "Drop if the claim wins"]);
    expect(rows[0]).not.toHaveTextContent("dropping");
    expect(rows[0]!.querySelector(".circuit-claimPass")?.textContent).toBe(
      "Pass for pick 3"
    );
    // No grip: the row itself drags, so it carries no handle.
    expect(list.querySelector(".nomination-drag-handle-button")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Reorder / })).toBeNull();
    expect(rows.every((row) => row.classList.contains("is-sortable"))).toBe(true);
    expect(screen.getByText(/Drag a claim to change its rank\.$/)).toBeInTheDocument();
    expect(rows[0]).not.toHaveTextContent("in Best Picture");
    // A claim without a drop has one line.
    expect(
      within(rows[1]!)
        .getAllByRole("img")
        .map((i) => i.getAttribute("aria-label"))
    ).toEqual(["Claim"]);
    const drop = within(rows[0]).getByRole("group", {
      name: "Drop if the claim wins: Best Picture: Night Train (2026)"
    });
    expect(drop.className).toContain("is-dropped");
    // The category is the icon: every pill draws one.
    expect(rows[0].querySelectorAll(".dr-pill .dr-pill-icon")).toHaveLength(2);

    // A click on the claim pill edits it, as Edit does.
    fireEvent.click(
      within(rows[0]).getByRole("button", { name: "Claim: Best Picture: Harbor (2026)" })
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

  it("moves a claim one rank with Alt+Arrow on its pill, and announces it", async () => {
    const handlers = renderWaivers();
    const harbor = screen.getByRole("button", {
      name: "Claim: Best Picture: Harbor (2026)"
    });
    expect(harbor.getAttribute("aria-keyshortcuts")).toBe("Alt+ArrowUp Alt+ArrowDown");
    harbor.focus();
    fireEvent.keyDown(harbor, { key: "ArrowDown", altKey: true });
    expect(handlers.onReorder).toHaveBeenCalledWith([9, 8]);
    expect(handlers.onEdit).not.toHaveBeenCalled();
    expect(
      screen.getByText("Moved claim for Harbor (2026) to rank 2 of 2.")
    ).toHaveAttribute("role", "status");
  });

  it("reorders claims by dragging a row, and a click that ends the drag does not edit", async () => {
    const handlers = renderWaivers();
    const rows = within(screen.getByRole("list", { name: "Your claims" })).getAllByRole(
      "listitem"
    );
    const rect = (index: number) =>
      ({
        top: index * 48,
        bottom: (index + 1) * 48,
        left: 0,
        right: 600,
        width: 600,
        height: 48,
        x: 0,
        y: index * 48,
        toJSON: () => ({})
      }) as DOMRect;
    rows.forEach((row, index) => {
      row.getBoundingClientRect = () => rect(index);
    });
    const harbor = screen.getByRole("button", {
      name: "Claim: Best Picture: Harbor (2026)"
    });
    const pointer = (type: string, y: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        clientX: 10,
        clientY: y,
        button: 0
      });
      Object.defineProperty(event, "isPrimary", { value: true });
      return event;
    };
    const step = (target: EventTarget, type: string, y: number) =>
      act(async () => {
        target.dispatchEvent(pointer(type, y));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    // The lifted copy, which dnd-kit collides with the rows, starts on the first row.
    const box = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue(rect(0));
    try {
      await step(harbor, "pointerdown", 24);
      await step(document, "pointermove", 32);
      await step(document, "pointermove", 72);
      await step(document, "pointerup", 72);
    } finally {
      box.mockRestore();
    }
    expect(handlers.onReorder).toHaveBeenCalledWith([9, 8]);
    fireEvent.click(harbor);
    expect(handlers.onEdit).not.toHaveBeenCalled();
    expect(
      screen.getByText("Moved claim for Harbor (2026) to rank 2 of 2.")
    ).toBeTruthy();
    // dnd-kit swallows clicks on the document until a later tick after a drop.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  });

  it("does not drag a claim from its icon actions", async () => {
    const handlers = renderWaivers();
    const up = screen.getByRole("button", { name: "Move Bea Moss, Quiet Sea (2026) up" });
    const pointer = (type: string, y: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        clientX: 10,
        clientY: y,
        button: 0
      });
      Object.defineProperty(event, "isPrimary", { value: true });
      return event;
    };
    await act(async () => {
      up.dispatchEvent(pointer("pointerdown", 60));
      document.dispatchEvent(pointer("pointermove", 20));
      document.dispatchEvent(pointer("pointerup", 20));
    });
    expect(handlers.onReorder).not.toHaveBeenCalled();
    expect(up.closest("li")!.classList.contains("is-dragging")).toBe(false);
  });

  it("freezes the claims while the window is processed", () => {
    renderWaivers({ claims: claimsFixture({ locked: true }) });
    expect(screen.getByText(/being processed/)).toBeInTheDocument();
    // Locked: no row drags and the drag hint is gone.
    expect(screen.queryByText(/Drag a claim to change its rank/)).toBeNull();
    expect(
      within(screen.getByRole("list", { name: "Your claims" }))
        .getAllByRole("listitem")
        .some((row) => row.classList.contains("is-sortable"))
    ).toBe(false);
    expect(
      screen.getByRole("button", { name: "Edit your claim for Harbor (2026)" })
    ).toBeDisabled();
    // The claim pills stay, read-only: no longer a button that edits.
    expect(
      screen.queryByRole("button", { name: "Claim: Best Picture: Harbor (2026)" })
    ).toBeNull();
    expect(
      screen.getByRole("group", { name: "Claim: Best Picture: Harbor (2026)" })
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

  it("shows priority with passes, and each run's claims as stacked moves", () => {
    renderWaivers();
    const priority = within(screen.getByRole("list", { name: "Waiver priority" }))
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(priority[0]).toContain("blake");
    expect(priority[1]).toContain("avery, you");
    expect(priority.join(" ")).not.toContain("(you)");
    expect(priority[1]).toContain("Pick 3 priority pass: Available");
    expect(screen.getByRole("heading", { name: "Waiver priority" })).toBeInTheDocument();
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
    // Line one: order, name and the outcome beside it; below, the moves.
    expect(results[0]).toHaveTextContent("1.averyWon · Pass for pick 2");
    expect(results[1]).toHaveTextContent("2.blakeLost: Someone ahead of them got it");
    expect(results[0]!.querySelector(".fo-playerName .fo-animalAvatar")).not.toBeNull();
    const won = within(results[0]).getByRole("group", {
      name: "Added: Best Actress: Ada Lane, Paper Moon (2026)"
    });
    expect(won.className).not.toContain("is-muted");
    // Nothing changed hands on a lost claim: both lines are muted, neither dashed.
    const lost = within(results[1]).getByRole("group", {
      name: "Claimed, lost: Best Actress: Ada Lane, Paper Moon (2026)"
    });
    expect(lost.className).toContain("is-muted");
    const wouldDrop = within(results[1]).getByRole("group", {
      name: "Would have dropped: Best Picture: Night Train (2026)"
    });
    expect(wouldDrop.className).toContain("is-muted");
    expect(wouldDrop.className).not.toContain("is-dropped");
    expect(results[1]).not.toHaveTextContent("dropping");

    // Priority after: an ordered list of players with avatars.
    const after = screen.getByRole("list", { name: "Priority after this run" });
    expect(
      within(after)
        .getAllByRole("listitem")
        .map((li) => li.textContent)
    ).toEqual(["blake", "avery"]);
    expect(after.querySelectorAll(".fo-animalAvatar")).toHaveLength(2);
  });

  it("tells a holder of an unused priority pass about it under Your claims", () => {
    renderWaivers();
    // The viewer's only pass already rides on a claim.
    expect(screen.queryByText(/You have a priority pass/)).toBeNull();
    cleanup();
    renderWaivers({
      claims: claimsFixture({
        chips: [{ id: 32, original_pick_number: 5, status: "AVAILABLE", claim_id: null }]
      })
    });
    expect(
      screen.getByText(
        "You have a priority pass for pick 5. Add it to a claim when you file it. It expires when this window's claims run."
      )
    ).toBeInTheDocument();
  });

  it("says when no claims have run yet", () => {
    renderWaivers({ runs: [] });
    expect(screen.getByText(/No claims have run yet/)).toBeInTheDocument();
  });

  it("opens the claim modal with the drop, the capacity warning and the pass", () => {
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
    const pass = within(dialog).getByRole("textbox", { name: "Priority pass" });
    expect(pass).toBeDisabled();
    expect(pass).toHaveAttribute("placeholder", "You have no priority passes");
    expect(within(dialog).getByText(/You get a priority pass when/)).toBeInTheDocument();
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
