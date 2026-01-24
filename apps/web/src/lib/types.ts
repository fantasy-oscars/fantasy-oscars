export type ApiResult = { ok: boolean; message: string };

export type FieldErrors = Partial<Record<string, string>>;

export type LeagueSummary = { id: number; code: string; name: string; ceremony_id: number };
export type LeagueDetail = LeagueSummary & { max_members?: number; roster_size?: number };

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
  status: string;
  created_at: string;
  ceremony_starts_at?: string | null;
  draft_id?: number | null;
  draft_status?: string | null;
  scoring_strategy_name?: string;
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
  status: string;
  scoring_strategy_name?: string;
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
    integrity_status?: string | null;
    allow_drafting_after_lock?: boolean;
    lock_override_set_by_user_id?: number | null;
    lock_override_set_at?: string | null;
  };
  seats: Array<{ seat_number: number; league_member_id: number; user_id?: number }>;
  picks: Array<{ pick_number: number; seat_number: number; nomination_id: number }>;
  version: number;
  picks_per_seat?: number | null;
  total_picks?: number | null;
  remainder_strategy?: string;
  ceremony_starts_at?: string | null;
  nomination_flags?: Array<{
    nomination_id: number;
    status: string;
    replaced_by_nomination_id?: number | null;
  }>;
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
};

