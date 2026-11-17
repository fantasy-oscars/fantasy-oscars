import type {
  CircuitLeagueDetail,
  CircuitLeagueStatus,
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
        ceremonies: [{ id: 1, code: "golden-2027", name: "Golden Reel 2027" }]
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
          { id: 2, code: "dga", name: "Directors Guild" },
          { id: 3, code: "sag", name: "Actors Guild" }
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
