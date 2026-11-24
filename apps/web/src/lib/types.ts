export type ApiResult = { ok: boolean; message: string; requestId?: string };

export type FieldErrors = Partial<Record<string, string>>;

export type LeagueSummary = {
  id: number;
  code: string;
  name: string;
  ceremony_id: number | null;
};
export type LeagueDetail = LeagueSummary & { max_members?: number; roster_size?: number };

export type CeremonySummary = {
  id: number;
  code: string;
  name: string;
  year?: number | null;
  starts_at?: string | null;
  status: string;
  results_finalized_at?: string | null;
};

export type LeagueMember = {
  id: number;
  user_id: number;
  role: string;
  username: string;
};

export type SeasonSummary = {
  id: number;
  league_id: number;
  ceremony_id: number;
  ceremony_name?: string | null;
  ceremony_code?: string | null;
  status: string;
  created_at: string;
  ceremony_starts_at?: string | null;
  ceremony_results_finalized_at?: string | null;
  draft_id?: number | null;
  draft_status?: string | null;
  scoring_strategy_name?: string;
  category_weights?: Record<string, number> | null;
  is_active_ceremony?: boolean;
  remainder_strategy?: string;
};

export type SeasonMember = {
  id: number;
  season_id: number;
  user_id: number;
  league_member_id: number | null;
  role: string;
  joined_at: string;
  username?: string;
};

export type SeasonInvite = {
  id: number;
  season_id: number;
  status: string;
  label: string | null;
  kind: string;
  created_at: string;
  updated_at: string;
  claimed_at: string | null;
};

export type InboxInvite = SeasonInvite & {
  league_id: number | null;
  league_name: string | null;
  ceremony_id: number | null;
};

export type SeasonMeta = {
  id: number;
  ceremony_id: number;
  ceremony_name?: string | null;
  ceremony_code?: string | null;
  status: string;
  scoring_strategy_name?: string;
  category_weights?: Record<string, number> | null;
  is_active_ceremony?: boolean;
  created_at?: string;
  ceremony_starts_at?: string | null;
  draft_id?: number | null;
  draft_status?: string | null;
  remainder_strategy?: string;
  pick_timer_seconds?: number | null;
  auto_pick_strategy?: string | null;
};

export type TokenMap = Record<number, string>;

export type Snapshot = {
  draft: {
    id: number;
    league_id: number;
    season_id: number;
    status: string;
    started_at?: string | null;
    completed_at?: string | null;
    current_pick_number?: number | null;
    version?: number | null;
    pick_timer_seconds?: number | null;
    pick_deadline_at?: string | null;
    pick_timer_remaining_ms?: number | null;
    auto_pick_strategy?: string | null;
    integrity_status?: string | null;
    allow_drafting_after_lock?: boolean;
    lock_override_set_by_user_id?: number | null;
    lock_override_set_at?: string | null;
  };
  can_manage_draft?: boolean;
  seats: Array<{
    seat_number: number;
    league_member_id: number;
    user_id?: number | null;
    username?: string | null;
    avatar_key?: string | null;
  }>;
  picks: Array<{ pick_number: number; seat_number: number; nomination_id: number }>;
  version: number;
  /** Server clock when the snapshot was built (ISO); used to correct local clock skew. */
  server_time?: string;
  picks_per_seat?: number | null;
  total_picks?: number | null;
  remainder_strategy?: string;
  nominee_pool_size?: number | null;
  turn?: {
    current_pick_number: number;
    seat_number: number;
    round_number: number;
    direction: "FORWARD" | "REVERSE";
  } | null;
  ceremony_id?: number | null;
  ceremony_starts_at?: string | null;
  ceremony_status?: string | null;
  ceremony_results_finalized_at?: string | null;
  scoring_strategy_name?: string | null;
  category_weights?: Record<string, number> | null;
  my_seat_number?: number | null;
  categories?: Array<{
    id: number;
    unit_kind: string;
    sort_index: number;
    family_name: string;
    icon_code: string | null;
    icon_variant?: "default" | "inverted";
  }>;
  nominations?: Array<{
    id: number;
    category_edition_id: number;
    label: string;
    status: string;
    film_title?: string | null;
    film_poster_url?: string | null;
    film_year?: number | null;
    contributors?: string[];
    performer_contributors?: Array<{
      full_name: string;
      role_label?: string | null;
      profile_url?: string | null;
      profile_path?: string | null;
      sort_order: number;
    }>;
    song_title?: string | null;
    performer_name?: string | null;
    performer_character?: string | null;
    performer_profile_url?: string | null;
    performer_profile_path?: string | null;
  }>;
  nomination_flags?: Array<{
    nomination_id: number;
    status: string;
    replaced_by_nomination_id?: number | null;
  }>;
  winners?: Array<{
    category_edition_id: number;
    nomination_id: number;
  }>;
  wisdom_benchmark?: {
    ceremony_id: number;
    version: number;
    computed_at: string;
    items: Array<{
      nomination_id: number;
      score: number;
      rank: number;
      sample_size: number;
    }>;
  } | null;
};

export type PublicLeague = {
  id: number;
  code: string;
  name: string;
  ceremony_id: number;
  max_members: number;
  roster_size: number;
  is_public: boolean;
  created_at: string;
  season_id?: number | null;
  season_status?: string | null;
  member_count: number;
};

export type DraftEventMessage = {
  draft_id: number;
  version: number;
  event_type: string;
  payload?: {
    draft?: {
      status?: string;
      current_pick_number?: number | null;
      completed_at?: string | null;
      started_at?: string | null;
    };
    pick?: {
      pick_number: number;
      seat_number: number;
      nomination_id: number;
    };
  };
  created_at: string;
  /** Server clock when the event was emitted (ISO); used to correct local clock skew. */
  server_time?: string;
};

/** A public Circuit; players see it as a season. */
export type CircuitSummary = {
  id: number;
  code: string;
  name: string;
  status: string;
  opens_on: string | null;
  activated_at: string | null;
};

export type CircuitLeagueStatus =
  "SETUP" | "INITIALIZED" | "DRAFTING" | "IN_SEASON" | "COMPLETE";

/** A league's settings for one Circuit competition. */
export type CircuitLeagueSettings = {
  id: number;
  circuit_id: number;
  league_id: number;
  status: CircuitLeagueStatus;
  roster_size: number;
  draft_type: string;
  pick_timer_seconds: number | null;
  auto_draft_enabled: boolean;
  nomination_points: number;
  win_bonus_points: number;
  initialized_at: string | null;
  created_at: string;
};

/** A row of `GET /leagues/:id/circuits`. */
export type CircuitLeagueSummary = CircuitLeagueSettings & {
  circuit_code: string;
  circuit_name: string;
  circuit_status: string;
  member_count: number;
  is_member: boolean;
};

export type CircuitLeagueEvent = {
  id: number;
  code: string;
  name: string;
  is_group: boolean;
  sort_index: number;
  enabled: boolean;
  weight: number;
  ceremonies: Array<{
    id: number;
    code: string;
    name: string;
    nominations_on: string | null;
    results_on: string | null;
  }>;
};

export type CircuitLeagueCategory = {
  id: number;
  code: string;
  name: string;
  kind: string;
  sort_index: number;
  weight: number;
  max_owned: number | null;
};

export type CircuitLeagueMember = {
  user_id: number;
  username: string;
  avatar_key: string | null;
  joined_at: string;
};

/** `GET /circuit-leagues/:id`, also returned by every write on it. */
export type CircuitLeagueDetail = {
  circuit_league: CircuitLeagueSettings;
  circuit: { id: number; code: string; name: string; status: string } | null;
  league: { id: number; code: string; name: string };
  events: CircuitLeagueEvent[];
  categories: CircuitLeagueCategory[];
  members: CircuitLeagueMember[];
  viewer: { is_league_member: boolean; is_member: boolean; can_manage: boolean };
};

/** A contender in a Circuit category, as the picker and rosters show it. */
export type CircuitSelectionSummary = {
  id: number;
  circuit_category_id: number;
  film_tmdb_id: number;
  person_tmdb_id: number | null;
  film: {
    id: number;
    title: string;
    release_year: number | null;
    poster_url: string | null;
  };
  person: { id: number; name: string; profile_url: string | null } | null;
};

/** A waiver window: free agency is closed from `starts_on` until `resolves_on`. */
export type CircuitWaiverWindow = {
  starts_on: string;
  ends_on: string;
  resolves_on: string;
  scoring_days: string[];
};

/** `GET /circuit-leagues/:id/roster`, also returned by drops and free-agent adds. */
export type CircuitRoster = {
  member: { user_id: number; username: string };
  status: CircuitLeagueStatus;
  roster_size: number;
  free_agency: { open: boolean; window: CircuitWaiverWindow | null };
  categories: Array<{
    id: number;
    code: string;
    name: string;
    kind: string;
    max_owned: number | null;
    owned: number;
  }>;
  entries: Array<{
    ownership_id: number;
    acquired_at: string;
    acquired_transaction_id: number;
    selection: CircuitSelectionSummary;
  }>;
};

export type CircuitTransactionKind =
  "DRAFT" | "SUPPLEMENTAL" | "WAIVER" | "FREE_AGENT" | "DROP";

/** A row of `GET /circuit-leagues/:id/transactions`, newest first. */
export type CircuitTransaction = {
  id: number;
  kind: CircuitTransactionKind | string;
  occurred_at: string;
  member: { user_id: number; username: string };
  add: CircuitSelectionSummary | null;
  drop: CircuitSelectionSummary | null;
};

/** A waiver window as the claims and waivers reads carry it. */
export type CircuitClaimWindow = {
  starts_on: string;
  ends_on: string;
  resolves_on: string;
};

export type CircuitChipStatus = "AVAILABLE" | "CONSUMED" | "EXPIRED";

export type CircuitWaiverFailureReason =
  "SELECTION_OWNED" | "DROP_NOT_OWNED" | "ROSTER_FULL" | "CATEGORY_LIMIT";

export type CircuitPriorityRow = {
  user_id: number;
  username: string;
  waiver_priority: number | null;
};

/** `GET /circuit-leagues/:id/waivers`: the open window, priority and every chip. */
export type CircuitWaivers = {
  window: CircuitClaimWindow | null;
  priority: CircuitPriorityRow[];
  chips: Array<{
    id: number;
    member: { user_id: number; username: string };
    original_pick_number: number;
    status: CircuitChipStatus | string;
  }>;
};

/** One of the viewer's own claims, first choice first. */
export type CircuitClaim = {
  id: number;
  rank: number;
  status: "PENDING" | "WON" | "LOST" | "WITHDRAWN" | string;
  failure_reason: CircuitWaiverFailureReason | string | null;
  selection: CircuitSelectionSummary;
  drop: CircuitSelectionSummary | null;
  chip: { id: number; original_pick_number: number } | null;
  created_at: string;
  updated_at: string;
};

/** `GET /circuit-leagues/:id/claims`, also returned by every claim write. */
export type CircuitClaims = {
  window: CircuitClaimWindow | null;
  /** The processor has started this window; claims no longer change. */
  locked: boolean;
  claims: CircuitClaim[];
  chips: Array<{
    id: number;
    original_pick_number: number;
    status: CircuitChipStatus | string;
    /** The pending claim the chip rides on, if any. */
    claim_id: number | null;
  }>;
};

/** A completed run in `GET /circuit-leagues/:id/waivers/results`, newest first. */
export type CircuitWaiverRun = {
  id: number;
  window: { starts_on: string; ends_on: string };
  completed_at: string;
  priority_before: CircuitPriorityRow[];
  priority_after: CircuitPriorityRow[];
  claims: Array<{
    id: number;
    /** The order the run evaluated the claims in, from 1. */
    order: number;
    member: { user_id: number; username: string };
    status: "WON" | "LOST" | string;
    failure_reason: CircuitWaiverFailureReason | string | null;
    selection: CircuitSelectionSummary;
    drop: CircuitSelectionSummary | null;
    chip: { original_pick_number: number } | null;
  }>;
};

/** A `waiver:result` message on the league's room. */
export type CircuitWaiverResultMessage = {
  circuit_league_id: number;
  run_id: number;
  window_starts_on: string;
  won: number;
  lost: number;
  chips_expired: number;
  server_time: string;
};

/** A member's place in `GET /circuit-leagues/:id/standings` or a ceremony breakdown. */
export type CircuitStandingRow = {
  /** Shared by tied members; the next rank skips (1, 1, 3). */
  rank: number;
  member: { user_id: number; username: string; avatar_key: string };
  points: number;
  nomination_points: number;
  win_points: number;
};

/** A ceremony that counts toward the season, as the standings list it. */
export type CircuitScoredCeremony = {
  id: number;
  code: string | null;
  name: string | null;
  /** The admin-given name of the ceremony's group, such as "Guild Awards". */
  event: { id: number; name: string };
  nominations_on: string | null;
  results_on: string | null;
};

/** `GET /circuit-leagues/:id/standings`: cumulative, from the scoring ledger. */
export type CircuitStandings = {
  standings: CircuitStandingRow[];
  /** Ceremonies of the league's enabled events, in date order. */
  ceremonies: Array<CircuitScoredCeremony & { points_awarded: number }>;
};

export type CircuitScoreKind = "NOMINATION" | "WIN";

/** `GET /circuit-leagues/:id/standings/ceremonies/:ceremonyId`. */
export type CircuitCeremonyBreakdown = {
  ceremony: CircuitScoredCeremony;
  standings: Array<
    CircuitStandingRow & {
      entries: Array<{
        selection: CircuitSelectionSummary;
        kind: CircuitScoreKind | string;
        occasion_date: string;
        points: number;
      }>;
    }
  >;
};

/** A `score:update` message on the league's room: its standings changed. */
export type CircuitScoreUpdateMessage = {
  circuit_league_id: number;
  ceremony_ids: number[];
  server_time: string;
};

export type CircuitDraftStatus = "IN_PROGRESS" | "SUPPLEMENTAL" | "PAUSED" | "COMPLETED";

/** The draft row as the snapshot carries it. */
export type CircuitDraft = {
  id: number;
  circuit_league_id: number;
  status: CircuitDraftStatus;
  draft_type: string;
  rounds: number;
  pick_timer_seconds: number | null;
  current_pick_number: number | null;
  pick_deadline_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  paused_at: string | null;
  version: number;
};

export type CircuitDraftSeat = {
  seat_number: number;
  member_id: number;
  user_id: number;
  username: string;
};

/** A pick slot that has resolved: picked (by hand or from the queue) or missed. */
export type CircuitDraftPick = {
  id: number;
  pick_number: number;
  original_pick_number: number;
  seat_number: number;
  member_id: number;
  outcome: "PICKED" | "MISSED";
  selection_id: number | null;
  source: string;
  request_id: string | null;
  made_at: string;
};

/** The slot on the clock; `supplemental` once the regular rounds are over. */
export type CircuitDraftClock = {
  pick_number: number;
  original_pick_number: number;
  seat_number: number;
  member_id: number;
  supplemental: boolean;
};

export type CircuitChip = {
  id: number;
  member_id: number;
  original_pick_number: number;
  status: string;
};

/** `GET /circuit-leagues/:id/draft` and `GET /circuit-drafts/:id/snapshot`. */
export type CircuitDraftSnapshot = {
  draft: CircuitDraft;
  seats: CircuitDraftSeat[];
  picks: CircuitDraftPick[];
  on_the_clock: CircuitDraftClock | null;
  chips: CircuitChip[];
  /** Every drafted selection, so the board can name each pick. */
  selections: CircuitSelectionSummary[];
  server_time: string;
};

/**
 * A `draft:event` on the `/circuits` namespace. Every payload has `draft`
 * (without `version`, which the message carries) and `on_the_clock`; some
 * also carry a `pick`, its `selection`, a `chip` or the `seats`.
 */
export type CircuitDraftEventMessage = {
  draft_id: number;
  circuit_league_id: number;
  version: number;
  event_type: string;
  payload: {
    draft?: Omit<CircuitDraft, "version">;
    on_the_clock?: CircuitDraftClock | null;
    pick?: CircuitDraftPick;
    selection?: CircuitSelectionSummary | null;
    chip?: CircuitChip | null;
    seats?: CircuitDraftSeat[];
  } | null;
  created_at: string;
  server_time: string;
};

/** `POST /circuit-drafts/:id/picks`. */
export type CircuitDraftPickResult = {
  pick: CircuitDraftPick;
  draft: CircuitDraft;
};

/** `GET /circuit-leagues/:id/queue`, also returned by every queue and staging write. */
export type CircuitQueue = {
  items: Array<{ position: number; selection: CircuitSelectionSummary }>;
  /** Staged selections, oldest first: drafted by hand only, never auto-picked. */
  staged: Array<{ selection: CircuitSelectionSummary }>;
};
