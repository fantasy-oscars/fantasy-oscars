export type DraftRecord = {
  id: number;
  league_id: number;
  season_id: number;
  status: "PENDING" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED";
  draft_order_type: "SNAKE" | "LINEAR";
  current_pick_number: number | null;
  picks_per_seat: number | null;
  remainder_strategy?: "UNDRAFTED" | "FULL_POOL";
  total_picks?: number | null;
  pick_timer_seconds?: number | null;
  auto_pick_strategy?:
    | "NEXT_AVAILABLE"
    | "RANDOM_SEED"
    | "ALPHABETICAL"
    | "CANONICAL"
    | "SMART"
    | "CUSTOM_USER"
    | null;
  auto_pick_seed?: string | null;
  auto_pick_config?: Record<string, unknown> | null;
  pick_deadline_at?: Date | null;
  pick_timer_remaining_ms?: number | null;
  allow_drafting_after_lock?: boolean;
  lock_override_set_by_user_id?: number | null;
  lock_override_set_at?: Date | null;
  version: number;
  started_at?: Date | null;
  completed_at?: Date | null;
};

export type DraftSeatRecord = {
  id: number;
  draft_id: number;
  league_member_id: number;
  seat_number: number;
  is_active: boolean;
  user_id?: number;
  username?: string;
  avatar_key?: string | null;
};

export type DraftPickRecord = {
  id: number;
  draft_id: number;
  pick_number: number;
  round_number: number;
  seat_number: number;
  league_member_id: number;
  user_id: number;
  nomination_id: number;
  made_at: Date | null;
  request_id?: string | null;
};

export type DraftEventRecord = {
  id: number;
  draft_id: number;
  version: number;
  event_type: string;
  payload: unknown;
  created_at: Date;
};

export type DraftResultRecord = {
  draft_id: number;
  nomination_id: number;
  won: boolean;
  points: number | null;
  created_at: Date;
  updated_at: Date;
};

