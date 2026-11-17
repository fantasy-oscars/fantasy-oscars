/**
 * Every TanStack Query key used by the web app lives here so invalidation
 * (after mutations) and reads agree on one vocabulary.
 */
export const queryKeys = {
  auth: {
    all: ["auth"] as const,
    me: () => ["auth", "me"] as const
  },
  leagues: {
    all: ["leagues"] as const,
    list: () => ["leagues", "list"] as const,
    index: () => ["leagues", "index"] as const,
    one: (leagueId: number) => ["leagues", "one", leagueId] as const,
    seasons: (leagueId: number) => ["leagues", "seasons", leagueId] as const,
    members: (leagueId: number) => ["leagues", "members", leagueId] as const,
    circuits: (leagueId: number) => ["leagues", "circuits", leagueId] as const,
    detail: (leagueId: number) => ["leagues", "detail", leagueId] as const
  },
  seasons: {
    all: ["seasons"] as const,
    index: () => ["seasons", "index"] as const,
    detail: (seasonId: number, leagueIdHint: number | null) =>
      ["seasons", "detail", seasonId, leagueIdHint] as const,
    detailAll: (seasonId: number) => ["seasons", "detail", seasonId] as const
  },
  ceremonies: {
    all: ["ceremonies"] as const,
    list: () => ["ceremonies", "list"] as const,
    detail: (ceremonyId: number) => ["ceremonies", "detail", ceremonyId] as const
  },
  circuits: {
    all: ["circuits"] as const,
    list: () => ["circuits", "list"] as const
  },
  circuitLeagues: {
    all: ["circuitLeagues"] as const,
    detail: (circuitLeagueId: number) =>
      ["circuitLeagues", "detail", circuitLeagueId] as const,
    /** A member's roster; `null` is the viewer's own. */
    roster: (circuitLeagueId: number, userId: number | null) =>
      ["circuitLeagues", "roster", circuitLeagueId, userId] as const,
    rosters: (circuitLeagueId: number) =>
      ["circuitLeagues", "roster", circuitLeagueId] as const,
    transactions: (circuitLeagueId: number) =>
      ["circuitLeagues", "transactions", circuitLeagueId] as const,
    /** The draft snapshot; null data before the draft starts. */
    draft: (circuitLeagueId: number) =>
      ["circuitLeagues", "draft", circuitLeagueId] as const,
    /** The viewer's own draft queue. */
    queue: (circuitLeagueId: number) =>
      ["circuitLeagues", "queue", circuitLeagueId] as const
  },
  invites: {
    all: ["invites"] as const,
    inbox: () => ["invites", "inbox"] as const
  }
};
