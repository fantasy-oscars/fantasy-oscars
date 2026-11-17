import type { CircuitLeagueDetail, CircuitLeagueStatus } from "@/lib/types";

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
