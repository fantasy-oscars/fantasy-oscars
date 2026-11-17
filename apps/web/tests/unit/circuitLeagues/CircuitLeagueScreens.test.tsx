import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MantineProvider } from "@ui";
import { CircuitLeagueScreen } from "@/features/circuitLeagues/screens/CircuitLeagueScreen";
import { LeagueSeasonsSection } from "@/features/leagues/ui/LeagueSeasonsSection";
import { LandingScreen } from "@/features/home/screens/LandingScreen";
import { circuitLeagueEditable, circuitLeagueFormFrom } from "@/decisions/circuitLeague";
import type { CircuitLeagueDetail } from "@/lib/types";
import { circuitLeagueDetail } from "./fixtures";

afterEach(cleanup);

function wrap(node: React.ReactNode) {
  return render(
    <MantineProvider>
      <MemoryRouter>{node}</MemoryRouter>
    </MantineProvider>
  );
}

function renderScreen(detail: CircuitLeagueDetail) {
  const handlers = {
    onChange: vi.fn(),
    onSave: vi.fn(),
    onReset: vi.fn(),
    onJoin: vi.fn(),
    onLeave: vi.fn(),
    onInitialize: vi.fn()
  };
  wrap(
    <CircuitLeagueScreen
      view={{
        state: "ready",
        detail,
        form: circuitLeagueFormFrom(detail),
        editable: circuitLeagueEditable(detail.circuit_league.status),
        dirty: true
      }}
      saving={false}
      acting={false}
      settingsStatus={null}
      memberStatus={null}
      lockStatus={null}
      {...handlers}
    />
  );
  return handlers;
}

/** The read-only row for a label: its `dd` value text. */
function readValue(label: string) {
  const dt = screen.getByText(label).closest("dt");
  if (!dt) throw new Error(`no read-only row for ${label}`);
  return dt.nextElementSibling?.textContent;
}

describe("circuit league setup screen", () => {
  it("lets a commissioner edit every setting, join and lock, and never says Circuit", () => {
    const handlers = renderScreen(circuitLeagueDetail({ viewer: { is_member: false } }));
    expect(
      screen.getByRole("heading", { level: 2, name: "Awards Season 2027" })
    ).toBeTruthy();
    expect(screen.getByText("Open")).toBeTruthy();
    expect(screen.getByLabelText("Roster size")).not.toHaveProperty("disabled", true);
    expect(screen.getByRole("switch", { name: /Guild Awards/ })).toHaveProperty(
      "disabled",
      false
    );
    expect(screen.getByText("Directors Guild, Actors Guild")).toBeTruthy();
    expect(screen.queryByText(/circuit/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Join season" }));
    fireEvent.click(screen.getByRole("button", { name: "Lock season" }));
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(handlers.onJoin).toHaveBeenCalled();
    expect(handlers.onInitialize).toHaveBeenCalled();
    expect(handlers.onSave).toHaveBeenCalled();
  });

  it("puts join and leave above the settings, and lock in a commissioner row", () => {
    renderScreen(circuitLeagueDetail({ viewer: { is_member: false } }));
    const join = screen.getByRole("button", { name: "Join season" });
    const settings = screen.getByRole("form", { name: "Season settings" });
    expect(
      join.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING
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

  it("shows a player the saved settings as text, with no inputs, and leave", () => {
    renderScreen(circuitLeagueDetail({ viewer: { can_manage: false } }));
    expect(screen.queryByRole("form", { name: "Season settings" })).toBeNull();
    expect(screen.getByRole("region", { name: "Season settings" })).toBeTruthy();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
    expect(readValue("Roster size")).toBe("16");
    expect(readValue("Points per win")).toBe("2");
    expect(readValue("Pick timer")).toBe("90 seconds");
    expect(readValue("Auto-draft")).toBe("On");
    expect(readValue("Guild Awards")).toBe("On · weight 1");
    expect(readValue("Best Picture")).toBe("Weight 1 · no limit");
    expect(screen.queryByRole("button", { name: "Save settings" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lock season" })).toBeNull();
    expect(screen.getByText("You’re in this season.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Leave season" })).toBeTruthy();
  });

  it("after locking, shows frozen settings as text and leaves the clock editable", () => {
    const detail = circuitLeagueDetail({ status: "INITIALIZED" });
    detail.events[1]!.enabled = false;
    renderScreen(detail);
    expect(screen.getByText("Pre-draft")).toBeTruthy();
    expect(readValue("Roster size")).toBe("16");
    expect(readValue("Guild Awards")).toBe("Off");
    expect(screen.queryByRole("switch", { name: /Golden Reel/ })).toBeNull();
    expect(screen.getByLabelText("Seconds per pick")).toHaveProperty("disabled", false);
    expect(screen.getByRole("switch", { name: /Auto-draft/ })).toHaveProperty(
      "disabled",
      false
    );
    expect(screen.queryByRole("button", { name: /Join season|Leave season/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lock season" })).toBeNull();
    expect(screen.getByText("You’re in this season. Membership is locked.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save settings" })).toBeTruthy();
  });
});

describe("league seasons list", () => {
  it("lists a Circuit competition beside Seasons and offers startable ones", () => {
    const onStart = vi.fn();
    wrap(
      <LeagueSeasonsSection
        leagueId={3}
        leagueName="Film Club"
        canCreateSeason
        seasons={[
          {
            id: 7,
            ceremonyId: 1,
            ceremonyCode: "golden-2027",
            ceremonyLabel: "Golden Reel 2027",
            statusLabel: "Pre-draft",
            isNavigable: true
          }
        ]}
        circuits={[
          { id: 4, name: "Awards Season 2027", statusLabel: "Open", meta: "2 members" }
        ]}
        startableCircuits={[{ id: 9, name: "Awards Season 2028" }]}
        onStartCircuit={onStart}
      />
    );
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByRole("link").getAttribute("href")).toBe(
      "/leagues/3/film-club/circuits/4"
    );
    expect(within(items[1]!).getByText("Golden Reel 2027")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Start Awards Season 2028" }));
    expect(onStart).toHaveBeenCalledWith(9);
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
    expect(circuit.getAttribute("href")).toBe("/leagues/3/film-club/circuits/4");
    expect(within(circuit).getByText("Open")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Golden Reel 2027/ })).toBeTruthy();
  });
});
