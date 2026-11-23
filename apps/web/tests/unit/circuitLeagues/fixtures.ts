import type {
  CircuitDraftSnapshot,
  CircuitLeagueDetail,
  CircuitLeagueStatus,
  CircuitQueue,
  CircuitRoster,
  CircuitSelectionSummary
} from "@/lib/types";

/** A Circuit league in setup with the defaults: two events (one grouped), two categories. */
export function circuitLeagueDetail(
  overrides: {
    status?: CircuitLeagueStatus;
    viewer?: Partial<CircuitLeagueDetail["viewer"]>;
  } = {}
): CircuitLeagueDetail {
  const status = overrides.status ?? "SETUP";
  return {
    circuit_league: {
      id: 4,
      circuit_id: 2,
      league_id: 3,
      status,
      roster_size: 16,
      draft_type: "SNAKE",
      pick_timer_seconds: 90,
      auto_draft_enabled: true,
      nomination_points: 1,
      win_bonus_points: 2,
      initialized_at: status === "SETUP" ? null : "2026-11-20T00:00:00Z",
      created_at: "2026-11-18T00:00:00Z"
    },
    circuit: { id: 2, code: "awards-2027", name: "Awards Season 2027", status: "ACTIVE" },
    league: { id: 3, code: "club", name: "Film Club" },
    events: [
      {
        id: 10,
        code: "golden",
        name: "Golden Reel",
        is_group: false,
        sort_index: 0,
        enabled: true,
        weight: 1,
        ceremonies: [
          {
            id: 1,
            code: "golden-2027",
            name: "Golden Reel 2027",
            nominations_on: "2026-12-07",
            results_on: "2027-01-10"
          }
        ]
      },
      {
        id: 11,
        code: "guilds",
        name: "Guild Awards",
        is_group: true,
        sort_index: 1,
        enabled: true,
        weight: 1,
        ceremonies: [
          {
            id: 2,
            code: "dga",
            name: "Directors Guild",
            nominations_on: "2027-01-07",
            results_on: "2027-01-30"
          },
          {
            id: 3,
            code: "sag",
            name: "Actors Guild",
            nominations_on: null,
            results_on: null
          }
        ]
      }
    ],
    categories: [
      {
        id: 20,
        code: "picture",
        name: "Best Picture",
        kind: "FILM",
        sort_index: 0,
        weight: 1,
        max_owned: null
      },
      {
        id: 21,
        code: "actress",
        name: "Best Actress",
        kind: "ACTING",
        sort_index: 1,
        weight: 1,
        max_owned: null
      }
    ],
    members: [
      {
        user_id: 5,
        username: "avery",
        avatar_key: null,
        joined_at: "2026-11-18T00:00:00Z"
      }
    ],
    viewer: {
      is_league_member: true,
      is_member: true,
      can_manage: true,
      ...overrides.viewer
    }
  };
}

/** A film pick (category 20) or, with a person, an acting pick (category 21). */
export function circuitSelection(
  id: number,
  title: string,
  person: string | null = null
): CircuitSelectionSummary {
  return {
    id,
    circuit_category_id: person ? 21 : 20,
    film_tmdb_id: 1000 + id,
    person_tmdb_id: person ? 2000 + id : null,
    film: { id: 100 + id, title, release_year: 2026, poster_url: null },
    person: person ? { id: 200 + id, name: person, profile_url: null } : null
  };
}

/** avery's roster in the in-season league: two picks out of `roster_size`. */
export function circuitRoster(
  overrides: {
    rosterSize?: number;
    maxActing?: number | null;
    freeAgency?: CircuitRoster["free_agency"];
    entries?: CircuitSelectionSummary[];
  } = {}
): CircuitRoster {
  const entries = overrides.entries ?? [
    circuitSelection(1, "Night Train"),
    circuitSelection(2, "Paper Moon", "Ada Lane")
  ];
  const owned = (categoryId: number) =>
    entries.filter((e) => e.circuit_category_id === categoryId).length;
  return {
    member: { user_id: 5, username: "avery" },
    status: "IN_SEASON",
    roster_size: overrides.rosterSize ?? 16,
    free_agency: overrides.freeAgency ?? { open: true, window: null },
    categories: [
      {
        id: 20,
        code: "picture",
        name: "Best Picture",
        kind: "FILM",
        max_owned: null,
        owned: owned(20)
      },
      {
        id: 21,
        code: "actress",
        name: "Best Actress",
        kind: "ACTING",
        max_owned: overrides.maxActing ?? null,
        owned: owned(21)
      }
    ],
    entries: entries.map((selection, i) => ({
      ownership_id: 50 + i,
      acquired_at: "2026-12-01T08:00:00Z",
      acquired_transaction_id: 70 + i,
      selection
    }))
  };
}

export const OPEN_WINDOW = {
  starts_on: "2027-01-08",
  ends_on: "2027-01-10",
  resolves_on: "2027-01-11",
  scoring_days: ["2027-01-08"]
};

/**
 * A two-seat, two-round draft after four regular picks and one supplemental:
 * avery (seat 1) picked 1, blake (seat 2) picked 2 and missed 3, avery
 * auto-picked 4 from the queue, and blake missed 5 (the supplemental for 3)
 * again, which made a chip.
 */
export function circuitDraftSnapshot(
  overrides: { status?: CircuitDraftSnapshot["draft"]["status"]; picks?: number } = {}
): CircuitDraftSnapshot {
  const allPicks: CircuitDraftSnapshot["picks"] = [
    draftPick(1, 1, 1, "PICKED", 31, "MANUAL"),
    draftPick(2, 2, 2, "PICKED", 32, "MANUAL"),
    draftPick(3, 3, 2, "MISSED", null, "AUTO"),
    draftPick(4, 4, 1, "PICKED", 33, "AUTO"),
    draftPick(5, 3, 2, "MISSED", null, "AUTO")
  ];
  const picks = allPicks.slice(0, overrides.picks ?? allPicks.length);
  const status = overrides.status ?? (picks.length === 5 ? "COMPLETED" : "IN_PROGRESS");
  const next = picks.length + 1;
  return {
    draft: {
      id: 9,
      circuit_league_id: 4,
      status,
      draft_type: "SNAKE",
      rounds: 2,
      pick_timer_seconds: 90,
      current_pick_number: status === "COMPLETED" ? null : next,
      pick_deadline_at: null,
      started_at: "2026-11-28T18:00:00Z",
      completed_at: status === "COMPLETED" ? "2026-11-28T18:10:00Z" : null,
      paused_at: null,
      version: picks.length + 1
    },
    seats: [
      { seat_number: 1, member_id: 41, user_id: 5, username: "avery" },
      { seat_number: 2, member_id: 42, user_id: 6, username: "blake" }
    ],
    picks,
    on_the_clock:
      status === "COMPLETED"
        ? null
        : next <= 4
          ? {
              pick_number: next,
              original_pick_number: next,
              seat_number: [1, 2, 2, 1][next - 1]!,
              member_id: [41, 42, 42, 41][next - 1]!,
              supplemental: false
            }
          : {
              pick_number: 5,
              original_pick_number: 3,
              seat_number: 2,
              member_id: 42,
              supplemental: true
            },
    chips:
      picks.length === 5
        ? [{ id: 1, member_id: 42, original_pick_number: 3, status: "ACTIVE" }]
        : [],
    selections: [
      circuitSelection(31, "Sunset Boulevard"),
      circuitSelection(32, "All About Eve"),
      circuitSelection(33, "Gaslight", "Ingrid Bergman")
    ].filter((s) => picks.some((p) => p.selection_id === s.id)),
    server_time: "2026-11-28T18:05:00Z"
  };
}

function draftPick(
  pickNumber: number,
  originalPickNumber: number,
  seat: number,
  outcome: "PICKED" | "MISSED",
  selectionId: number | null,
  source: "MANUAL" | "AUTO"
): CircuitDraftSnapshot["picks"][number] {
  return {
    id: 100 + pickNumber,
    pick_number: pickNumber,
    original_pick_number: originalPickNumber,
    seat_number: seat,
    member_id: 40 + seat,
    outcome,
    selection_id: selectionId,
    source,
    request_id: source === "MANUAL" ? `r${pickNumber}` : null,
    made_at: "2026-11-28T18:01:00Z"
  };
}

/** A queue in the given order, top first, and the staged selections. */
export function circuitQueue(
  selections: CircuitSelectionSummary[],
  staged: CircuitSelectionSummary[] = []
): CircuitQueue {
  return {
    items: selections.map((selection, i) => ({ position: i + 1, selection })),
    staged: staged.map((selection) => ({ selection }))
  };
}
