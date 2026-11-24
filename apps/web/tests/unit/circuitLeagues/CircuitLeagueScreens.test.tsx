import {
  cleanup,
  fireEvent,
  getByText,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MantineProvider } from "@ui";
import { CircuitLeagueScreen } from "@/features/circuitLeagues/screens/CircuitLeagueScreen";
import { LeagueSeasonsSection } from "@/features/leagues/ui/LeagueSeasonsSection";
import { LandingScreen } from "@/features/home/screens/LandingScreen";
import { circuitLeagueEditable } from "@/decisions/circuitLeague";
import {
  fullSeasonSettingsFrom,
  type FullSeasonSettings,
  type SettingsArea
} from "@/decisions/fullSeasonSettings";
import type { AreaSaveResult } from "@/orchestration/circuitLeague";
import { ConfirmProvider } from "@/notifications";
import type { CircuitLeagueDetail } from "@/lib/types";
import type { SeasonListItem } from "@/decisions/seasonList";
import { circuitLeagueDetail } from "./fixtures";

afterEach(cleanup);

function wrap(node: React.ReactNode) {
  return render(
    <MantineProvider>
      <MemoryRouter>{node}</MemoryRouter>
    </MantineProvider>
  );
}

function renderScreen(
  detail: CircuitLeagueDetail,
  onSaveArea: (
    area: SettingsArea,
    next: FullSeasonSettings
  ) => Promise<AreaSaveResult> = vi.fn().mockResolvedValue({ ok: true })
) {
  const handlers = {
    onSaveArea: vi.fn(onSaveArea),
    onJoin: vi.fn(),
    onLeave: vi.fn(),
    onInitialize: vi.fn()
  };
  render(
    <MantineProvider>
      <ConfirmProvider>
        <MemoryRouter>
          <CircuitLeagueScreen
            view={{
              state: "ready",
              detail,
              settings: fullSeasonSettingsFrom(detail),
              editable: circuitLeagueEditable(detail.circuit_league.status)
            }}
            acting={false}
            memberStatus={null}
            lockStatus={null}
            {...handlers}
          />
        </MemoryRouter>
      </ConfirmProvider>
    </MantineProvider>
  );
  return handlers;
}

/** The read-only row for a label: its `dd` value text. */
function readValue(within: HTMLElement, label: string) {
  const dt = getByText(within, label).closest("dt");
  if (!dt) throw new Error(`no read-only row for ${label}`);
  return dt.nextElementSibling?.textContent;
}

const settingsCard = () => screen.getByRole("region", { name: "Season settings" });

describe("full season page settings", () => {
  it("summarises each area for a commissioner, with an Edit per area, and never says Circuit", () => {
    const handlers = renderScreen(circuitLeagueDetail({ viewer: { is_member: false } }));
    expect(
      screen.getByRole("heading", { level: 2, name: "Awards Season 2027" })
    ).toBeTruthy();
    const card = settingsCard();
    expect(
      within(card).getByText("You can change these until you lock the season.")
    ).toBeTruthy();
    for (const area of ["events", "scoring", "roster", "draft"]) {
      expect(within(card).getByRole("button", { name: `Edit ${area}` })).toBeTruthy();
    }
    expect(within(card).getByText("All 2 events count equally.")).toBeTruthy();
    expect(within(card).getByText("Golden Reel, Guild Awards")).toBeTruthy();
    expect(within(card).getByText("1 point per nomination, 2 per win.")).toBeTruthy();
    expect(within(card).getByText("16 contenders per player.")).toBeTruthy();
    expect(within(card).getByText("Snake draft, 90 seconds per pick.")).toBeTruthy();
    expect(within(card).queryAllByRole("textbox")).toHaveLength(0);
    expect(within(card).queryByRole("button", { name: /Save/ })).toBeNull();
    expect(screen.queryByText(/circuit/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Join season" }));
    fireEvent.click(screen.getByRole("button", { name: "Lock season" }));
    expect(handlers.onJoin).toHaveBeenCalled();
    expect(handlers.onInitialize).toHaveBeenCalled();
  });

  it("puts join and leave above the settings, and lock in a commissioner row", () => {
    renderScreen(circuitLeagueDetail({ viewer: { is_member: false } }));
    const join = screen.getByRole("button", { name: "Join season" });
    expect(
      join.compareDocumentPosition(settingsCard()) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByText("You’re not in this season yet.")).toBeTruthy();

    const commissioner = screen.getByRole("region", { name: "Commissioner" });
    expect(
      within(commissioner).getByRole("button", { name: "Lock season" })
    ).toBeTruthy();
    expect(
      within(commissioner).queryByRole("button", { name: "Join season" })
    ).toBeNull();
  });

  it("opens the events modal with each event's switch, ceremonies and weight", async () => {
    renderScreen(circuitLeagueDetail());
    fireEvent.click(screen.getByRole("button", { name: "Edit events" }));
    const dialog = await screen.findByRole("dialog", { name: "Events" });
    expect(within(dialog).getByRole("switch", { name: /Guild Awards/ })).toBeTruthy();
    expect(within(dialog).getByText("Directors Guild, Actors Guild")).toBeTruthy();
    expect(within(dialog).getByText("2 of 2 on")).toBeTruthy();
    expect(within(dialog).getByLabelText("Golden Reel weight")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true
    );

    fireEvent.click(within(dialog).getByRole("switch", { name: /Golden Reel/ }));
    expect(within(dialog).getByText("1 of 2 on")).toBeTruthy();
    expect(within(dialog).getByLabelText("Golden Reel weight")).toHaveProperty(
      "disabled",
      true
    );
    expect(within(dialog).getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      false
    );
  });

  it("saves one area from its modal and reports it in the status line", async () => {
    const handlers = renderScreen(circuitLeagueDetail());
    fireEvent.click(screen.getByRole("button", { name: "Edit scoring" }));
    const dialog = await screen.findByRole("dialog", { name: "Scoring" });
    fireEvent.change(within(dialog).getByLabelText("Points per nomination"), {
      target: { value: "3" }
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(handlers.onSaveArea).toHaveBeenCalledTimes(1));
    const [area, next] = handlers.onSaveArea.mock.calls[0]!;
    expect(area).toBe("scoring");
    expect(next.nominationPoints).toBe(3);
    expect(next.rosterSize).toBe(16);
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Scoring" })).toBeNull()
    );
    expect(within(settingsCard()).getByText("Scoring saved.")).toBeTruthy();
  });

  it("keeps the modal open with the server's message when a save fails", async () => {
    renderScreen(
      circuitLeagueDetail(),
      vi.fn().mockResolvedValue({ ok: false, message: "This season is locked" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit draft" }));
    const dialog = await screen.findByRole("dialog", { name: "Draft" });
    fireEvent.click(within(dialog).getByRole("switch", { name: /Auto-draft/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("This season is locked")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Draft" })).toBeTruthy();
  });

  it("blocks an invalid value, marks the input and moves focus to it", async () => {
    const handlers = renderScreen(circuitLeagueDetail());
    fireEvent.click(screen.getByRole("button", { name: "Edit roster" }));
    const dialog = await screen.findByRole("dialog", { name: "Roster" });
    const limit = within(dialog).getByLabelText("Best Picture limit");
    fireEvent.change(limit, { target: { value: "0" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(limit.getAttribute("aria-invalid")).toBe("true"));
    const describedBy = limit.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(describedBy)?.textContent).toBe(
      "Enter a whole number from 1 to 64, or leave it empty."
    );
    expect(
      within(dialog).getAllByText("Enter a whole number from 1 to 64, or leave it empty.")
    ).toHaveLength(2);
    await waitFor(() => expect(document.activeElement).toBe(limit));
    expect(handlers.onSaveArea).not.toHaveBeenCalled();
  });

  it("asks before discarding changes, and Keep editing keeps the modal", async () => {
    renderScreen(circuitLeagueDetail());
    fireEvent.click(screen.getByRole("button", { name: "Edit roster" }));
    const dialog = await screen.findByRole("dialog", { name: "Roster" });
    fireEvent.change(within(dialog).getByLabelText("Roster size"), {
      target: { value: "12" }
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    const ask = await screen.findByRole("dialog", { name: "Discard changes?" });
    expect(
      within(ask).getByText("Your changes to roster haven't been saved.")
    ).toBeTruthy();
    fireEvent.click(within(ask).getByRole("button", { name: "Keep editing" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Discard changes?" })).toBeNull()
    );
    expect(screen.getByRole("dialog", { name: "Roster" })).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    const again = await screen.findByRole("dialog", { name: "Discard changes?" });
    fireEvent.click(within(again).getByRole("button", { name: "Discard" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Roster" })).toBeNull()
    );
  });

  it("shows a player View buttons and read-only modals with a single Close", async () => {
    renderScreen(circuitLeagueDetail({ viewer: { can_manage: false } }));
    const card = settingsCard();
    expect(within(card).queryByText(/You can change these/)).toBeNull();
    for (const area of ["events", "scoring", "roster", "draft"]) {
      expect(within(card).getByRole("button", { name: `View ${area}` })).toBeTruthy();
    }
    fireEvent.click(within(card).getByRole("button", { name: "View scoring" }));
    const dialog = await screen.findByRole("dialog", { name: "Scoring" });
    expect(readValue(dialog, "Points per win")).toBe("2");
    expect(readValue(dialog, "Best Picture")).toBe("Weight 1");
    expect(within(dialog).queryAllByRole("textbox")).toHaveLength(0);
    const buttons = within(dialog)
      .getAllByRole("button")
      .map((b) => b.textContent)
      .filter((t) => t !== "");
    expect(buttons).toEqual(["Close"]);
    expect(screen.queryByRole("button", { name: "Lock season" })).toBeNull();
    expect(screen.getByRole("button", { name: "Leave season" })).toBeTruthy();
  });

  it("after locking, fixes events, scoring and roster and keeps the draft editable", async () => {
    const detail = circuitLeagueDetail({ status: "INITIALIZED" });
    detail.events[1]!.enabled = false;
    renderScreen(detail);
    const card = settingsCard();
    expect(screen.getByText("Pre-draft")).toBeTruthy();
    expect(
      within(card).getByText(
        "The season is locked, so events, scoring and the roster are fixed. Draft settings can change until the draft starts."
      )
    ).toBeTruthy();
    expect(within(card).getByRole("button", { name: "View events" })).toBeTruthy();
    expect(within(card).getByRole("button", { name: "View scoring" })).toBeTruthy();
    expect(within(card).getByRole("button", { name: "View roster" })).toBeTruthy();
    expect(within(card).getByRole("button", { name: "Edit draft" })).toBeTruthy();

    fireEvent.click(within(card).getByRole("button", { name: "View events" }));
    const events = await screen.findByRole("dialog", { name: "Events" });
    expect(readValue(events, "Guild Awards")).toBe("Off");
    expect(readValue(events, "Golden Reel")).toBe("On · weight 1");
    expect(screen.queryByRole("button", { name: /Join season|Leave season/ })).toBeNull();
    expect(screen.getByText("You’re in this season. Membership is locked.")).toBeTruthy();
  });

  it("fixes every area once the draft has started", () => {
    renderScreen(circuitLeagueDetail({ status: "DRAFTING" }));
    const card = settingsCard();
    expect(
      within(card).getByText("Settings are fixed now that the draft has started.")
    ).toBeTruthy();
    expect(within(card).queryByRole("button", { name: /^Edit/ })).toBeNull();
    expect(within(card).getAllByRole("button", { name: /^View/ })).toHaveLength(4);
  });
});

describe("league seasons list", () => {
  const seasons: SeasonListItem[] = [
    {
      kind: "full",
      id: 4,
      title: "Awards Season 2027",
      statusLabel: "Pre-draft",
      createdAt: "2026-11-02T00:00:00Z",
      memberCount: 2
    },
    {
      kind: "ceremony",
      id: 7,
      title: "Golden Reel 2027",
      statusLabel: "Pre-draft",
      createdAt: "2026-11-01T00:00:00Z",
      ceremonyId: 1,
      ceremonyCode: "golden-2027",
      isNavigable: true
    }
  ];

  it("lists both kinds in one list and one card style, each with a kind label", () => {
    wrap(
      <LeagueSeasonsSection
        leagueId={3}
        leagueName="Film Club"
        canCreateSeason
        seasons={seasons}
      />
    );
    const lists = screen.getAllByRole("list");
    expect(lists).toHaveLength(1);
    const items = within(lists[0]!).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByRole("link").getAttribute("href")).toBe(
      "/leagues/3/film-club/seasons/full/4"
    );
    expect(within(items[0]!).getByText("Full awards season · 2 members")).toBeTruthy();
    expect(within(items[1]!).getByRole("link").getAttribute("href")).toBe(
      "/leagues/3/film-club/golden-2027"
    );
    expect(within(items[1]!).getByText("Single ceremony")).toBeTruthy();
    expect(
      items.map((li) => li.querySelector(".baseline-standardCard")?.className)
    ).toEqual([
      "baseline-card baseline-standardCard isInteractive",
      "baseline-card baseline-standardCard isInteractive"
    ]);
    expect(screen.getByRole("link", { name: "Create season" })).toBeTruthy();
  });

  it("offers nothing to start: no Start button and no unstarted seasons", () => {
    wrap(
      <LeagueSeasonsSection
        leagueId={3}
        leagueName="Film Club"
        canCreateSeason
        seasons={[]}
      />
    );
    expect(screen.queryByRole("button", { name: /start/i })).toBeNull();
    expect(screen.queryByText(/not started/i)).toBeNull();
    expect(screen.getByText("No seasons yet.")).toBeTruthy();
    expect(
      screen.getByText("Create one for a single ceremony or the full awards season.")
    ).toBeTruthy();
  });

  it("shows players the list without Create season or a permission note", () => {
    wrap(
      <LeagueSeasonsSection
        leagueId={3}
        leagueName="Film Club"
        canCreateSeason={false}
        seasons={[]}
      />
    );
    expect(screen.queryByRole("link", { name: "Create season" })).toBeNull();
    expect(screen.queryByText("Commissioner permission required.")).toBeNull();
    expect(screen.queryByText(/Create one for/)).toBeNull();
    expect(screen.getByText("No seasons yet.")).toBeTruthy();
  });
});

describe("Home active seasons", () => {
  it("lists the viewer's Circuit competitions beside their Seasons", () => {
    const detail = circuitLeagueDetail();
    wrap(
      <LandingScreen
        user={{ sub: "5", username: "avery" } as never}
        authLoading={false}
        view={{
          updates: { state: "ready", content: null },
          seasons: {
            state: "ready",
            total: 2,
            circuits: [
              {
                ...detail.circuit_league,
                circuit_code: "awards-2027",
                circuit_name: "Awards Season 2027",
                circuit_status: "ACTIVE",
                member_count: 1,
                is_member: true,
                league_name: "Film Club"
              }
            ],
            seasons: [
              {
                id: 7,
                league_id: 3,
                ceremony_id: 1,
                ceremony_code: "golden-2027",
                status: "EXTANT",
                is_active_ceremony: true,
                draft_id: null,
                draft_status: null,
                created_at: "2026-11-18T00:00:00Z",
                league_name: "Film Club",
                league_code: "club",
                ceremony_name: "Golden Reel 2027"
              } as never
            ]
          }
        }}
        refresh={{ updates: async () => {}, seasons: async () => {} }}
      />
    );
    const circuit = screen.getByRole("link", { name: /Awards Season 2027/ });
    expect(circuit.getAttribute("href")).toBe("/leagues/3/film-club/seasons/full/4");
    expect(within(circuit).getByText("Pre-draft")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Golden Reel 2027/ })).toBeTruthy();
  });
});
