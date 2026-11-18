import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MantineProvider } from "@ui";
import { CircuitWaiversScreen } from "@/features/circuitLeagues/screens/CircuitWaiversScreen";
import { circuitPendingClaims } from "@/decisions/circuitWaivers";
import type { CircuitClaims, CircuitWaiverRun, CircuitWaivers } from "@/lib/types";
import type { CircuitClaimDraft } from "@/orchestration/circuitWaivers";
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
    runs?: CircuitWaiverRun[];
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
          picker={null}
          phone={false}
          draft={input.draft ?? null}
          dropOptions={circuitRoster().entries}
          chipOptions={[]}
          warning={input.warning ?? null}
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
  it("lists the viewer's claims in rank order with their drop and chip", () => {
    const handlers = renderWaivers();
    const list = screen.getByRole("list", { name: "Your claims" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Harbor (2026)");
    expect(rows[0]).toHaveTextContent("Drop Night Train (2026) · Pick 3 chip");
    expect(rows[1]).toHaveTextContent("No drop");

    fireEvent.click(screen.getByRole("button", { name: "Move Harbor (2026) down" }));
    expect(handlers.onReorder).toHaveBeenCalledWith([9, 8]);
    fireEvent.click(
      screen.getByRole("button", { name: "Edit your claim for Harbor (2026)" })
    );
    expect(handlers.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 8 }));
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

  it("freezes the claims while the window is processed", () => {
    renderWaivers({ claims: claimsFixture({ locked: true }) });
    expect(screen.getByText(/being processed/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit your claim for Harbor (2026)" })
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

    const results = within(
      screen.getByRole("list", {
        name: "Claims for Jan 1, 2027 to Jan 3, 2027, in the order they ran"
      })
    ).getAllByRole("listitem");
    expect(results[0]).toHaveTextContent("1. avery");
    expect(results[0]).toHaveTextContent("Won · Pick 2 chip");
    expect(results[1]).toHaveTextContent("Lost: Someone ahead of them got it");
    expect(results[1]).toHaveTextContent(
      "Claimed Ada Lane, Paper Moon (2026), dropping Night Train (2026)"
    );
    expect(screen.getByText("Priority after: blake, avery")).toBeInTheDocument();
  });

  it("says when no claims have run yet", () => {
    renderWaivers({ runs: [] });
    expect(screen.getByText(/No claims have run yet/)).toBeInTheDocument();
  });

  it("opens the claim modal with the drop, the capacity warning and the chip", () => {
    const handlers = renderWaivers({
      draft: { claimId: null, selection: harbor, dropSelectionId: null, chipId: null },
      warning: "Your roster is full. Without a drop, this claim fails."
    });
    const dialog = screen.getByRole("dialog", { name: "Claim Harbor (2026)" });
    expect(within(dialog).getByText(/Your roster is full/)).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: "Chip" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "File claim" }));
    expect(handlers.onSaveClaim).toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(handlers.onCloseClaim).toHaveBeenCalled();
  });
});
