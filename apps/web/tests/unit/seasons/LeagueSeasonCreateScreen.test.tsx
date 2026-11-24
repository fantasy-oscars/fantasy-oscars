import { useState } from "react";
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
import { LeagueSeasonCreateScreen } from "@/features/seasons/screens/LeagueSeasonCreateScreen";
import type { LeagueSeasonCreateView } from "@/orchestration/seasons";
import type { SeasonKind, SeasonKindAvailability } from "@/decisions/seasonKinds";
import type { CircuitSummary, LeagueDetail } from "@/lib/types";
import {
  fullSeasonDefaults,
  type SettingsCategory,
  type SettingsEvent
} from "@/decisions/fullSeasonSettings";
import { ConfirmProvider } from "@/notifications";

afterEach(cleanup);

type ReadyView = Extract<LeagueSeasonCreateView, { state: "ready" }>;

const OPEN: SeasonKindAvailability = { available: true };

function circuit(id: number, name: string): CircuitSummary {
  return {
    id,
    code: `c${id}`,
    name,
    status: "ACTIVE",
    opens_on: null,
    activated_at: null
  };
}

const EVENTS: SettingsEvent[] = [
  { id: 10, name: "Golden Reel", is_group: false, ceremonies: [] },
  {
    id: 11,
    name: "Guild Awards",
    is_group: true,
    ceremonies: [{ name: "Directors Guild" }, { name: "Actors Guild" }]
  }
];
const CATEGORIES: SettingsCategory[] = [
  { id: 20, name: "Best Picture" },
  { id: 21, name: "Best Actress" }
];

function readyView(overrides: Partial<ReadyView> = {}): ReadyView {
  return {
    state: "ready",
    league: { id: 3, name: "Film Club", code: "film-club" } as LeagueDetail,
    ceremonies: [{ id: 11, code: "oscars-2036", name: "Oscars 2036" } as never],
    working: false,
    status: null,
    fieldErrors: {},
    ceremonyId: null,
    scoringStrategy: "fixed",
    remainderStrategy: "UNDRAFTED",
    timerEnabled: true,
    pickTimerSeconds: 60,
    canSubmit: false,
    kinds: { ceremony: OPEN, full: OPEN },
    kindOrder: ["ceremony", "full"],
    checkingFull: false,
    openCircuits: [circuit(5, "Awards Season 2036")],
    fullCircuitId: 5,
    fullWorking: false,
    fullStatus: null,
    fullSettings: fullSeasonDefaults(EVENTS, CATEGORIES),
    fullOptions: { state: "ready", events: EVENTS, categories: CATEGORIES },
    fullDiscarded: false,
    ...overrides
  };
}

function actions() {
  return {
    chooseKind: vi.fn(),
    retryFull: vi.fn(),
    setFullCircuitId: vi.fn(),
    resetFull: vi.fn(),
    submitFull: vi.fn(),
    retryFullOptions: vi.fn(),
    applyFullArea: vi.fn(() => ({ ok: true as const })),
    setCeremonyId: vi.fn(),
    setScoringStrategy: vi.fn(),
    setRemainderStrategy: vi.fn(),
    setTimerEnabled: vi.fn(),
    setPickTimerSeconds: vi.fn(),
    reset: vi.fn(),
    submit: vi.fn()
  };
}

/** Mirrors the page: the chosen kind is held outside the screen, as the URL holds it. */
function Harness(props: {
  view: ReadyView;
  actions: ReturnType<typeof actions>;
  initialKind?: SeasonKind | null;
}) {
  const [kind, setKind] = useState<SeasonKind | null>(props.initialKind ?? null);
  return (
    <LeagueSeasonCreateScreen
      leagueId={3}
      view={props.view}
      requestedKind={kind}
      actions={{
        ...props.actions,
        chooseKind: (k) => {
          props.actions.chooseKind(k);
          setKind(k);
        }
      }}
    />
  );
}

function renderScreen(view: ReadyView, initialKind: SeasonKind | null = null) {
  const a = actions();
  render(
    <MantineProvider>
      <ConfirmProvider>
        <MemoryRouter>
          <Harness view={view} actions={a} initialKind={initialKind} />
        </MemoryRouter>
      </ConfirmProvider>
    </MantineProvider>
  );
  return a;
}

const kindGroup = () => screen.getByRole("group", { name: "Kind of season" });

describe("Create season kind choice", () => {
  it("offers only single ceremony, and preselects it, when full seasons are gated", () => {
    renderScreen(readyView({ kindOrder: ["ceremony"] }), "full");
    expect(screen.queryByRole("radio", { name: /full awards season/i })).toBeNull();
    expect(screen.getByRole("radio", { name: /single ceremony/i })).toBeChecked();
  });

  it("offers both kinds with their descriptions and preselects neither", () => {
    renderScreen(readyView());
    const ceremony = screen.getByRole("radio", { name: "Single ceremony" });
    const full = screen.getByRole("radio", { name: "Full awards season" });
    expect(ceremony).toHaveProperty("checked", false);
    expect(full).toHaveProperty("checked", false);
    expect(ceremony).toHaveProperty("disabled", false);
    expect(full).toHaveProperty("disabled", false);
    expect(ceremony.getAttribute("aria-describedby")).toBeTruthy();
    expect(
      screen.getByText(
        "Draft from one awards night's nominees, like the Oscars, and score when your picks win."
      )
    ).toBeTruthy();
    expect(
      screen.getByText(/Draft once and score across the whole awards season/)
    ).toBeTruthy();
    expect(kindGroup().getAttribute("aria-describedby")).toBeNull();
    // Nothing below the choice until a kind is picked.
    expect(screen.queryByRole("form")).toBeNull();
  });

  it("reaches today's single-ceremony form when Single ceremony is chosen", () => {
    const a = renderScreen(readyView({ ceremonyId: 11, canSubmit: true }));
    fireEvent.click(screen.getByRole("radio", { name: "Single ceremony" }));
    expect(a.chooseKind).toHaveBeenCalledWith("ceremony");

    const form = screen.getByRole("form", { name: "Single ceremony season" });
    for (const label of ["Ceremony", "Scoring strategy", "Leftover picks"]) {
      expect(within(form).getAllByLabelText(label).length).toBeGreaterThan(0);
    }
    expect(within(form).getByRole("switch", { name: "Pick timer" })).toBeTruthy();
    expect(within(form).getByLabelText("Seconds per pick")).toBeTruthy();
    expect(within(form).getByRole("button", { name: "Reset" })).toBeTruthy();
    fireEvent.click(within(form).getByRole("button", { name: "Create season" }));
    expect(a.submit).toHaveBeenCalledTimes(1);
  });

  it("reaches the full-season form when Full awards season is chosen", () => {
    const a = renderScreen(readyView());
    fireEvent.click(screen.getByRole("radio", { name: "Full awards season" }));
    expect(a.chooseKind).toHaveBeenCalledWith("full");

    const form = screen.getByRole("form", { name: "Full awards season" });
    expect(within(form).getByText("Awards season")).toBeTruthy();
    expect(within(form).getByText("Awards Season 2036")).toBeTruthy();
    fireEvent.click(within(form).getByRole("button", { name: "Create season" }));
    expect(a.submitFull).toHaveBeenCalledTimes(1);
  });

  it("asks which awards season by name when more than one is open", () => {
    renderScreen(
      readyView({
        openCircuits: [
          circuit(6, "2026–27 Awards Season"),
          circuit(5, "Awards Season 2036")
        ],
        fullCircuitId: 6
      }),
      "full"
    );
    const form = screen.getByRole("form", { name: "Full awards season" });
    expect(within(form).getAllByLabelText("Awards season").length).toBeGreaterThan(0);
    expect(within(form).getByDisplayValue("2026–27 Awards Season")).toBeTruthy();
  });

  it("labels a ceremony that is not live yet as coming soon, and says the draft waits", () => {
    renderScreen(
      readyView({
        ceremonies: [
          { id: 11, code: "oscars-2036", name: "Oscars 2036", status: "ACTIVE" },
          { id: 12, code: "oscars-2037", name: "Oscars 2037", status: "PUBLISHED" }
        ] as never,
        ceremonyId: 12
      }),
      "ceremony"
    );
    const form = screen.getByRole("form", { name: "Single ceremony season" });
    expect(within(form).getByDisplayValue("Oscars 2037 · Coming soon")).toBeTruthy();
    expect(
      within(form).getByText(
        "You can set up the season and invite players now. The draft opens when the ceremony goes live."
      )
    ).toBeTruthy();
    fireEvent.click(within(form).getAllByLabelText("Ceremony")[0]!);
    expect(screen.getByRole("option", { name: "Oscars 2036" })).toBeTruthy();
    expect(
      screen.getByRole("option", { name: "Oscars 2037 · Coming soon" })
    ).toBeTruthy();
  });

  it("says nothing about going live when the chosen ceremony is live", () => {
    renderScreen(
      readyView({
        ceremonies: [
          { id: 11, code: "oscars-2036", name: "Oscars 2036", status: "ACTIVE" }
        ] as never,
        ceremonyId: 11
      }),
      "ceremony"
    );
    expect(screen.getByDisplayValue("Oscars 2036")).toBeTruthy();
    expect(screen.queryByText(/goes live/)).toBeNull();
  });

  it("labels an awards season that is not live yet as coming soon, in the picker and alone", () => {
    const comingSoon = { ...circuit(7, "Awards Season 2037"), status: "PUBLISHED" };
    renderScreen(
      readyView({
        openCircuits: [circuit(5, "Awards Season 2036"), comingSoon],
        fullCircuitId: 7
      }),
      "full"
    );
    const form = screen.getByRole("form", { name: "Full awards season" });
    expect(
      within(form).getByDisplayValue("Awards Season 2037 · Coming soon")
    ).toBeTruthy();
    expect(
      within(form).getByText(
        "You can set up the season and invite players now. The draft opens when the season goes live."
      )
    ).toBeTruthy();
    cleanup();

    renderScreen(readyView({ openCircuits: [comingSoon], fullCircuitId: 7 }), "full");
    expect(screen.getByText("Awards Season 2037 · Coming soon")).toBeTruthy();
  });

  it("disables an unavailable kind, says why, and preselects the other", () => {
    renderScreen(
      readyView({
        kinds: {
          ceremony: OPEN,
          full: {
            available: false,
            reason: "This league already plays Awards Season 2035.",
            retry: false
          }
        },
        openCircuits: [],
        fullCircuitId: null
      })
    );
    const full = screen.getByRole("radio", { name: "Full awards season" });
    expect(full).toHaveProperty("disabled", true);
    const reason = screen.getByText("This league already plays Awards Season 2035.");
    expect(kindGroup().getAttribute("aria-describedby")).toBe(reason.id);
    expect(screen.getByRole("radio", { name: "Single ceremony" })).toHaveProperty(
      "checked",
      true
    );
    expect(screen.getByRole("form", { name: "Single ceremony season" })).toBeTruthy();
  });

  it("explains a missing ceremony and preselects the full season", () => {
    renderScreen(
      readyView({
        ceremonies: [],
        kinds: {
          ceremony: {
            available: false,
            reason: "No ceremonies are open for leagues right now.",
            retry: false
          },
          full: OPEN
        }
      })
    );
    expect(screen.getByRole("radio", { name: "Single ceremony" })).toHaveProperty(
      "disabled",
      true
    );
    expect(
      screen.getByText("No ceremonies are open for leagues right now.")
    ).toBeTruthy();
    expect(screen.getByRole("form", { name: "Full awards season" })).toBeTruthy();
  });

  it("offers a retry when open awards seasons could not be checked", () => {
    const a = renderScreen(
      readyView({
        kinds: {
          ceremony: OPEN,
          full: {
            available: false,
            reason: "Couldn't check for open awards seasons.",
            retry: true
          }
        },
        openCircuits: [],
        fullCircuitId: null
      })
    );
    expect(screen.getByText("Couldn't check for open awards seasons.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(a.retryFull).toHaveBeenCalledTimes(1);
  });

  it("shows both reasons and a note, and no form, when neither kind is available", () => {
    renderScreen(
      readyView({
        ceremonies: [],
        kinds: {
          ceremony: {
            available: false,
            reason: "No ceremonies are open for leagues right now.",
            retry: false
          },
          full: {
            available: false,
            reason: "No full awards season is open right now.",
            retry: false
          }
        },
        openCircuits: [],
        fullCircuitId: null
      })
    );
    expect(
      screen.getAllByRole("radio").every((r) => (r as HTMLInputElement).disabled)
    ).toBe(true);
    const note = screen.getByText(
      "Check back when the next ceremony or awards season opens."
    );
    expect(kindGroup().getAttribute("aria-describedby")?.split(" ")).toContain(note.id);
    expect(screen.queryByRole("form")).toBeNull();
  });
});

describe("Create season, full awards season settings", () => {
  const fullForm = () => screen.getByRole("form", { name: "Full awards season" });

  it("summarises each area with its defaults, each with Edit, and Create works as is", () => {
    const a = renderScreen(readyView(), "full");
    const form = fullForm();
    expect(within(form).getByRole("heading", { name: "Settings" })).toBeTruthy();
    expect(
      within(form).getByText(
        "The defaults suit most leagues. You can change these until you lock the season."
      )
    ).toBeTruthy();
    expect(within(form).getByText("All 2 events count equally.")).toBeTruthy();
    expect(within(form).getByText("1 point per nomination, 2 per win.")).toBeTruthy();
    expect(within(form).getByText("Every category counts equally.")).toBeTruthy();
    expect(within(form).getByText("16 contenders per player.")).toBeTruthy();
    expect(within(form).getByText("No category limits.")).toBeTruthy();
    expect(within(form).getByText("Snake draft, 90 seconds per pick.")).toBeTruthy();
    expect(within(form).getByText("Auto-draft on.")).toBeTruthy();
    const edits = ["events", "scoring", "roster", "draft"].map((area) =>
      within(form).getByRole("button", { name: `Edit ${area}` })
    );
    expect(edits.every((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
    fireEvent.click(within(form).getByRole("button", { name: "Create season" }));
    expect(a.submitFull).toHaveBeenCalledTimes(1);
  });

  it("applies a modal's values locally with Done and says so in the status line", async () => {
    const a = renderScreen(readyView(), "full");
    fireEvent.click(within(fullForm()).getByRole("button", { name: "Edit scoring" }));
    const dialog = await screen.findByRole("dialog", { name: "Scoring" });
    expect(within(dialog).getByText("Category weights")).toBeTruthy();
    expect(within(dialog).getByText("Every category counts equally")).toBeTruthy();
    expect(within(dialog).getByLabelText("Best Picture weight")).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Best Picture weight"), {
      target: { value: "2" }
    });
    expect(within(dialog).getByText("1 weighted")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));

    await waitFor(() => expect(a.applyFullArea).toHaveBeenCalledTimes(1));
    const [area, next] = a.applyFullArea.mock.calls[0]! as unknown as [
      string,
      ReturnType<typeof fullSeasonDefaults>
    ];
    expect(area).toBe("scoring");
    expect(next.categories[20]).toEqual({ weight: 2, maxOwned: null });
    expect(a.submitFull).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Scoring" })).toBeNull()
    );
    expect(within(fullForm()).getByText("Scoring updated.")).toBeTruthy();
  });

  it("keeps Enter in a modal from submitting the page form", async () => {
    const a = renderScreen(readyView(), "full");
    fireEvent.click(within(fullForm()).getByRole("button", { name: "Edit roster" }));
    const dialog = await screen.findByRole("dialog", { name: "Roster" });
    const size = within(dialog).getByLabelText("Roster size");
    fireEvent.change(size, { target: { value: "12" } });
    fireEvent.submit(size.closest("form")!);
    await waitFor(() => expect(a.applyFullArea).toHaveBeenCalledTimes(1));
    expect(a.submitFull).not.toHaveBeenCalled();
  });

  it("warns, without blocking, when no events are on or limits cannot fill a roster", async () => {
    renderScreen(readyView(), "full");
    fireEvent.click(within(fullForm()).getByRole("button", { name: "Edit events" }));
    const events = await screen.findByRole("dialog", { name: "Events" });
    fireEvent.click(within(events).getByRole("switch", { name: /Golden Reel/ }));
    fireEvent.click(within(events).getByRole("switch", { name: /Guild Awards/ }));
    expect(
      within(events).getByText("No events are on, so nothing will score.")
    ).toBeTruthy();
    expect(within(events).getByText("0 of 2 on")).toBeTruthy();
    expect(within(events).getByRole("button", { name: "Done" })).toHaveProperty(
      "disabled",
      false
    );
  });

  it("restores an area's defaults inside the modal", async () => {
    renderScreen(readyView(), "full");
    fireEvent.click(within(fullForm()).getByRole("button", { name: "Edit draft" }));
    const dialog = await screen.findByRole("dialog", { name: "Draft" });
    expect(
      within(dialog).getByText("Snake draft: the order reverses each round.")
    ).toBeTruthy();
    const timer = within(dialog).getByRole("switch", { name: "Pick timer" });
    fireEvent.click(timer);
    expect(within(dialog).getByLabelText("Seconds per pick")).toHaveProperty(
      "disabled",
      true
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Reset to defaults" }));
    expect(within(dialog).getByLabelText("Seconds per pick")).toHaveProperty(
      "disabled",
      false
    );
    expect(within(dialog).getByText("Defaults restored.")).toBeTruthy();
  });

  it("shows skeletons and disables the dependent rows while events and categories load", () => {
    renderScreen(readyView({ fullOptions: { state: "loading" } }), "full");
    const form = fullForm();
    for (const area of ["events", "scoring", "roster"]) {
      expect(within(form).getByRole("button", { name: `Edit ${area}` })).toHaveProperty(
        "disabled",
        true
      );
    }
    expect(within(form).getByRole("button", { name: "Edit draft" })).toHaveProperty(
      "disabled",
      false
    );
    expect(within(form).getByRole("button", { name: "Create season" })).toHaveProperty(
      "disabled",
      false
    );
  });

  it("offers a retry when events and categories fail to load, and Create stays enabled", () => {
    const a = renderScreen(readyView({ fullOptions: { state: "error" } }), "full");
    const form = fullForm();
    expect(
      within(form).getByText("Couldn't load this awards season's events and categories.")
    ).toBeTruthy();
    expect(within(form).getAllByText("Not loaded")).toHaveLength(3);
    fireEvent.click(within(form).getByRole("button", { name: "Try again" }));
    expect(a.retryFullOptions).toHaveBeenCalledTimes(1);
    expect(within(form).getByRole("button", { name: "Create season" })).toHaveProperty(
      "disabled",
      false
    );
  });

  it("explains an awards season with no events and disables its Edit", () => {
    renderScreen(
      readyView({
        fullSettings: fullSeasonDefaults([], CATEGORIES),
        fullOptions: { state: "ready", events: [], categories: CATEGORIES }
      }),
      "full"
    );
    const edit = within(fullForm()).getByRole("button", { name: "Edit events" });
    expect(edit).toHaveProperty("disabled", true);
    const summary = document.getElementById(edit.getAttribute("aria-describedby") ?? "");
    expect(summary?.textContent).toBe("This awards season has no events yet.");
  });

  it("says when changing the awards season put events and categories back", () => {
    renderScreen(
      readyView({
        openCircuits: [
          circuit(6, "2026–27 Awards Season"),
          circuit(5, "Awards Season 2036")
        ],
        fullCircuitId: 6,
        fullDiscarded: true
      }),
      "full"
    );
    expect(
      within(fullForm()).getByText(
        "Event and category settings are back to their defaults for this awards season."
      )
    ).toBeTruthy();
  });
});
