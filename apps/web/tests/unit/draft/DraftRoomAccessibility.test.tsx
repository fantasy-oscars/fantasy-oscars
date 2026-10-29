import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MantineProvider } from "@ui";
import type { DraftRoomOrchestration } from "@/orchestration/draft";
import { DraftRoomScreen } from "@/features/draft/screens/DraftRoomScreen";
import { DraftHeaderLeftWing } from "@/features/draft/ui/DraftHeaderLeftWing";
import { DraftHeaderRightWing } from "@/features/draft/ui/DraftHeaderRightWing";
import { describeConnection } from "@/decisions/draft/connection";
import { DEFAULT_DRAFT_ROOM_PREFERENCES } from "@/decisions/draft/preferences";

vi.mock("@/auth/context", () => ({
  useAuthContext: () => ({ user: { sub: "1", username: "alice" } })
}));
vi.mock("socket.io-client", () => ({ io: vi.fn() }));

const nomination = (id: number, label: string, selected: boolean) => ({
  id,
  label,
  muted: false,
  selected,
  winner: false
});

function makeOrchestration(
  overrides: {
    selectedId?: number | null;
    connection?: DraftRoomOrchestration["connection"];
    ledgerRows?: DraftRoomOrchestration["ledger"]["rows"];
    activeSeat?: number;
    onSelect?: (id: number) => void;
    onSubmit?: (id: number) => void;
    onClear?: () => void;
  } = {}
): DraftRoomOrchestration {
  const selectedId = overrides.selectedId ?? null;
  const activeSeat = overrides.activeSeat ?? 1;
  return {
    state: { loadingInitial: false, refreshing: false, error: null },
    nav: { backToSeasonHref: "/seasons/1" },
    header: {
      participants: [
        {
          seatNumber: 1,
          label: "Alice",
          active: activeSeat === 1,
          avatarKey: "gorilla",
          userId: 1
        },
        {
          seatNumber: 2,
          label: "Bob",
          active: activeSeat === 2,
          avatarKey: "bird",
          userId: 2
        }
      ],
      status: "IN_PROGRESS",
      roundNumber: 1,
      pickNumber: 1,
      direction: "FORWARD",
      hasTimer: false,
      clockText: "Off",
      timerRemainingMs: null,
      poolMode: "ALL_MUTED",
      setPoolMode: () => {},
      view: "draft",
      setView: () => {},
      canToggleView: true,
      canStartDraft: false,
      startLoading: false,
      startResult: null,
      onStartDraft: () => {},
      canManageDraft: true,
      pauseLoading: false,
      pauseResult: null,
      onPauseDraft: () => {},
      resumeLoading: false,
      resumeResult: null,
      onResumeDraft: () => {},
      ceremonyStatus: null,
      isFinalResults: false,
      resultsWinnerLabel: null,
      resultsPodium: [],
      scoringStrategyName: "fixed",
      getNominationPoints: () => 1
    },
    layout: {
      phase: "LIVE",
      showRosterOnly: false,
      boardCols: "1fr",
      rails: {
        ledger: { collapsed: false, hide: () => {}, show: () => {} },
        myRoster: { collapsed: false, hide: () => {}, show: () => {} },
        autodraft: { collapsed: false, hide: () => {}, show: () => {} }
      }
    },
    ledger: { rows: overrides.ledgerRows ?? [] },
    pool: {
      categories: [
        {
          id: 1,
          title: "Best Picture",
          icon: "e4eb",
          unitKind: "FILM",
          nominations: [
            nomination(10, "Film A", selectedId === 10),
            nomination(11, "Film B", selectedId === 11)
          ],
          emptyText: null
        }
      ],
      onSelectNomination: (id) => overrides.onSelect?.(id)
    },
    myRoster: {
      seatNumber: 1,
      picks: [],
      selected: selectedId ? { id: selectedId, icon: null, label: "x" } : null,
      clearSelection: () => overrides.onClear?.(),
      canPick: false,
      pickDisabledReason: null,
      pickLoading: false,
      pickPending: false,
      pickState: null,
      submitPick: () => {},
      submitPickNomination: (id) => overrides.onSubmit?.(id)
    },
    rosterBoard: { seats: [], maxRows: 0, rowsBySeat: new Map(), emptyText: null },
    autodraft: {
      enabled: false,
      setEnabled: () => {},
      strategy: "random",
      setStrategy: () => {},
      plans: [],
      selectedPlanId: null,
      setSelectedPlanId: () => {},
      list: [],
      loading: false,
      saving: false,
      error: null
    },
    cursorSpy: { enabled: false, cursors: [], emit: () => {} },
    connection: overrides.connection ?? describeConnection("connected"),
    preferences: { value: DEFAULT_DRAFT_ROOM_PREFERENCES, update: () => {} },
    refresh: () => {}
  };
}

function renderScreen(o: DraftRoomOrchestration) {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <DraftRoomScreen o={o} />
      </MemoryRouter>
    </MantineProvider>
  );
}

/** Accessible name approximation: aria-label, else visible text outside aria-hidden parts. */
function accessibleName(el: Element): string {
  const label = el.getAttribute("aria-label")?.trim();
  if (label) return label;
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ")
      .trim();
    if (text) return text;
  }
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll("[aria-hidden='true']").forEach((n) => n.remove());
  return (clone.textContent ?? "").trim() || (el.getAttribute("title") ?? "").trim();
}

function expectEveryButtonNamed(root: ParentNode) {
  const buttons = within(root as HTMLElement).queryAllByRole("button");
  expect(buttons.length).toBeGreaterThan(0);
  const unnamed = buttons.filter((b) => !accessibleName(b)).map((b) => b.outerHTML);
  expect(unnamed).toEqual([]);
}

describe("draft room accessibility", () => {
  afterEach(() => cleanup());

  it("names every button in the draft room", () => {
    const { container } = renderScreen(makeOrchestration());
    expectEveryButtonNamed(container);
  });

  it("names every button in the full (non-compact) header wings", () => {
    const common = {
      compactHeader: false,
      isCompleted: false,
      isPre: false,
      isPaused: false,
      view: "draft" as const,
      onViewChange: () => {},
      canToggleView: true
    };
    const { container } = render(
      <MantineProvider>
        <MemoryRouter>
          <DraftHeaderLeftWing
            {...common}
            compactMenuOpen={false}
            setCompactMenuOpen={() => {}}
            backHref="/seasons/1"
            participants={[]}
            activeIndex={0}
            direction="FORWARD"
            participantStripLayout={{
              containerRef: { current: null },
              capacity: 0,
              start: 0,
              end: 0
            }}
            onParticipantHoverSeat={() => {}}
          />
          <DraftHeaderRightWing
            {...common}
            showDraftControls
            canManageDraft
            showDrafted
            onToggleShowDrafted={() => {}}
            showDraftedVisible
            themeIcon="e518"
            onToggleTheme={() => {}}
            soundEnabled
            onToggleSound={() => {}}
            showCursorSpyToggle
            cursorSpyUserEnabled
            onToggleCursorSpy={() => {}}
            onStartDraft={() => {}}
            onPauseDraft={() => {}}
            onResumeDraft={() => {}}
            userLabel="Alice"
            userAvatarKey="gorilla"
          />
        </MemoryRouter>
      </MantineProvider>
    );
    expectEveryButtonNamed(container);
  });

  it("has a polite live region announcing whose turn it is and the latest pick", () => {
    const { rerender } = renderScreen(
      makeOrchestration({
        activeSeat: 2,
        ledgerRows: [
          {
            pickNumber: 1,
            roundPick: "1-1",
            seatNumber: 1,
            seatLabel: "Alice",
            nominationId: 10,
            icon: null,
            label: "Film A",
            active: false,
            winner: false
          }
        ]
      })
    );
    const region = screen
      .getAllByRole("status")
      .find((el) => el.getAttribute("aria-live") === "polite");
    expect(region).toBeDefined();
    expect(region).toHaveTextContent("Pick 1: Alice drafted Film A. Bob is picking.");

    rerender(
      <MantineProvider>
        <MemoryRouter>
          <DraftRoomScreen o={makeOrchestration({ activeSeat: 1 })} />
        </MemoryRouter>
      </MantineProvider>
    );
    expect(region).toHaveTextContent("It is your turn to pick.");
  });

  it("does not announce an optimistic (pending) pick", () => {
    renderScreen(
      makeOrchestration({
        activeSeat: 2,
        ledgerRows: [
          {
            pickNumber: 1,
            roundPick: "1-1",
            seatNumber: 1,
            seatLabel: "Alice",
            nominationId: 10,
            icon: null,
            label: "Film A",
            active: false,
            winner: false,
            pending: true
          }
        ]
      })
    );
    const region = screen
      .getAllByRole("status")
      .find((el) => el.getAttribute("aria-live") === "polite");
    expect(region).toHaveTextContent("Bob is picking.");
    expect(region).not.toHaveTextContent("Film A");
  });

  it("lets a keyboard user arm a nominee and confirm the pick", async () => {
    const onSelect = vi.fn();
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    function Harness() {
      const [selected, setSelected] = useState<number | null>(null);
      return (
        <DraftRoomScreen
          o={makeOrchestration({
            selectedId: selected,
            onSelect: (id) => {
              onSelect(id);
              setSelected(id);
            },
            onSubmit
          })}
        />
      );
    }
    render(
      <MantineProvider>
        <MemoryRouter>
          <Harness />
        </MemoryRouter>
      </MantineProvider>
    );

    // Enter the category from its heading, as a keyboard user would.
    screen.getByRole("button", { name: "Category: Best Picture" }).focus();
    await user.keyboard("{Enter}");
    const pill = screen.getByRole("button", { name: "Best Picture: Film A" });
    expect(pill).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith(10);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Best Picture: Film A" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    // Plain Space or Enter on the armed nominee never drafts; only Shift+Enter does.
    await user.keyboard(" ");
    await user.keyboard("{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(10);
  });

  it("ignores held keys: repeat keydowns neither arm nor pick", () => {
    const onSelect = vi.fn();
    const onSubmit = vi.fn();
    renderScreen(
      makeOrchestration({ selectedId: 10, onSelect, onSubmit, onClear: vi.fn() })
    );
    const pill = screen.getByRole("button", { name: "Best Picture: Film A" });
    fireEvent.keyDown(pill, { key: "Enter", repeat: true });
    fireEvent.keyDown(pill, { key: " ", repeat: true });
    fireEvent.keyDown(pill, { key: "Enter", shiftKey: true, repeat: true });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("a quick double-tap of Enter does not draft", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderScreen(makeOrchestration({ onSubmit }));
    screen.getByRole("button", { name: "Category: Best Picture" }).focus();
    await user.keyboard("{Enter}");
    await user.keyboard("{Enter}{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("acts once per Space press (on keyup) and swallows the synthesized click", async () => {
    const onSelect = vi.fn();
    renderScreen(makeOrchestration({ onSelect }));
    const pill = screen.getByRole("button", { name: "Best Picture: Film A" });
    fireEvent.keyDown(pill, { key: " " });
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.keyUp(pill, { key: " " });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("lets a keyboard user disarm with Escape", async () => {
    const onSelect = vi.fn();
    const onClear = vi.fn();
    const user = userEvent.setup();
    renderScreen(makeOrchestration({ selectedId: 10, onSelect, onClear }));
    screen.getByRole("button", { name: "Category: Best Picture" }).focus();
    await user.keyboard("{Enter}");
    await user.keyboard("{Escape}");
    // Disarming goes through the same toggle as a click on the selected nominee.
    expect(onClear).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("shows the connection indicator and disables picks while disconnected", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderScreen(
      makeOrchestration({
        connection: describeConnection("reconnecting"),
        onSelect
      })
    );
    expect(screen.getByTestId("draft-connection-indicator")).toHaveTextContent(
      "Connection lost. Reconnecting…"
    );
    screen.getByRole("button", { name: "Category: Best Picture" }).focus();
    await user.keyboard("{Enter}");
    await user.keyboard("{Enter}");
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Best Picture: Film A" })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
  });

  it("hides the connection indicator while connected", () => {
    renderScreen(makeOrchestration());
    expect(screen.queryByTestId("draft-connection-indicator")).toBeNull();
  });
});
