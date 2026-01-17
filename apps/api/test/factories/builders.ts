import { addSeconds } from "../support/time.js";

let seq = 1;
const baseTime = new Date("2024-01-01T00:00:00.000Z");

export function resetFactorySequence() {
  seq = 1;
}

function nextSeq() {
  return seq++;
}

export type Icon = {
  id: number;
  code: string;
  name: string;
  asset_path: string;
};

export type Ceremony = {
  id: number;
  code: string;
  name: string;
  year: number;
  starts_at: Date;
};

export type CategoryFamily = {
  id: number;
  code: string;
  name: string;
  icon_id: number;
  default_unit_kind: "FILM" | "SONG" | "PERFORMANCE";
};

export type CategoryEdition = {
  id: number;
  ceremony_id: number;
  family_id: number;
  unit_kind: "FILM" | "SONG" | "PERFORMANCE";
  icon_id: number | null;
  sort_index: number;
};

export type Film = {
  id: number;
  title: string;
  country: string | null;
};

export type Person = {
  id: number;
  full_name: string;
};

export type Song = {
  id: number;
  title: string;
  film_id: number;
};

export type Performance = {
  id: number;
  film_id: number;
  person_id: number;
};

export type Nomination = {
  id: number;
  category_edition_id: number;
  film_id: number | null;
  song_id: number | null;
  performance_id: number | null;
};

export type AppUser = {
  id: number;
  handle: string;
  email: string;
  display_name: string;
  created_at: Date;
};

export type AuthPassword = {
  user_id: number;
  password_hash: string;
  password_algo: string;
  password_set_at: Date;
};

export type League = {
  id: number;
  code: string;
  name: string;
  ceremony_id: number;
  max_members: number;
  roster_size: number;
  is_public: boolean;
  created_by_user_id: number;
  created_at: Date;
};

export type LeagueMember = {
  id: number;
  league_id: number;
  user_id: number;
  role: "OWNER" | "CO_OWNER" | "MEMBER";
  joined_at: Date;
};

export type Draft = {
  id: number;
  league_id: number;
  season_id: number;
  status: "PENDING" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED";
  draft_order_type: "SNAKE" | "LINEAR";
  current_pick_number: number | null;
  picks_per_seat: number | null;
  version: number;
  started_at: Date | null;
  completed_at: Date | null;
};

export type Season = {
  id: number;
  league_id: number;
  ceremony_id: number;
  status: "EXTANT" | "CANCELLED";
  scoring_strategy_name: "fixed" | "negative";
  created_at: Date;
};

export type DraftSeat = {
  id: number;
  draft_id: number;
  league_member_id: number;
  seat_number: number;
  is_active: boolean;
};

export type DraftPick = {
  id: number;
  draft_id: number;
  pick_number: number;
  round_number: number;
  seat_number: number;
  league_member_id: number;
  user_id: number;
  nomination_id: number;
  made_at: Date | null;
};

export function buildIcon(overrides: Partial<Icon> = {}): Icon {
  const n = nextSeq();
  return {
    id: n,
    code: `icon-${n}`,
    name: `Icon ${n}`,
    asset_path: `/assets/icon-${n}.svg`,
    ...overrides
  };
}

export function buildCeremony(overrides: Partial<Ceremony> = {}): Ceremony {
  const n = nextSeq();
  return {
    id: n,
    code: `cer-${n}`,
    name: `Ceremony ${n}`,
    year: 2000 + n,
    starts_at: overrides.starts_at ?? addSeconds(baseTime, n * 3600),
    ...overrides
  };
}

export function buildCategoryFamily(
  overrides: Partial<CategoryFamily> = {}
): CategoryFamily {
  const n = nextSeq();
  return {
    id: n,
    code: `catfam-${n}`,
    name: `Category Family ${n}`,
    icon_id: overrides.icon_id ?? n,
    default_unit_kind: "FILM",
    ...overrides
  };
}

export function buildCategoryEdition(
  overrides: Partial<CategoryEdition> = {}
): CategoryEdition {
  const n = nextSeq();
  return {
    id: n,
    ceremony_id: overrides.ceremony_id ?? n,
    family_id: overrides.family_id ?? n,
    unit_kind: "FILM",
    icon_id: overrides.icon_id ?? null,
    sort_index: overrides.sort_index ?? 0,
    ...overrides
  };
}

export function buildFilm(overrides: Partial<Film> = {}): Film {
  const n = nextSeq();
  return {
    id: n,
    title: `Film ${n}`,
    country: null,
    ...overrides
  };
}

export function buildPerson(overrides: Partial<Person> = {}): Person {
  const n = nextSeq();
  return {
    id: n,
    full_name: `Person ${n}`,
    ...overrides
  };
}

export function buildSong(overrides: Partial<Song> = {}): Song {
  const n = nextSeq();
  return {
    id: n,
    title: `Song ${n}`,
    film_id: overrides.film_id ?? n,
    ...overrides
  };
}

export function buildPerformance(overrides: Partial<Performance> = {}): Performance {
  const n = nextSeq();
  return {
    id: n,
    film_id: overrides.film_id ?? n,
    person_id: overrides.person_id ?? n,
    ...overrides
  };
}

export function buildNomination(overrides: Partial<Nomination> = {}): Nomination {
  const n = nextSeq();
  const film_id = overrides.film_id ?? n;
  return {
    id: n,
    category_edition_id: overrides.category_edition_id ?? n,
    film_id,
    song_id: overrides.song_id ?? null,
    performance_id: overrides.performance_id ?? null,
    ...overrides
  };
}

export function buildUser(overrides: Partial<AppUser> = {}): AppUser {
  const n = nextSeq();
  return {
    id: n,
    handle: `user${n}`,
    email: `user${n}@example.com`,
    display_name: `User ${n}`,
    created_at: baseTime,
    ...overrides
  };
}

export function buildAuthPassword(overrides: Partial<AuthPassword> = {}): AuthPassword {
  return {
    user_id: overrides.user_id ?? 1,
    password_hash: overrides.password_hash ?? "hashed-password",
    password_algo: overrides.password_algo ?? "argon2id-v1",
    password_set_at: overrides.password_set_at ?? baseTime
  };
}

export function buildLeague(overrides: Partial<League> = {}): League {
  const n = nextSeq();
  return {
    id: n,
    code: `league-${n}`,
    name: `League ${n}`,
    ceremony_id: overrides.ceremony_id ?? n,
    max_members: overrides.max_members ?? 8,
    roster_size: overrides.roster_size ?? 10,
    is_public: overrides.is_public ?? false,
    created_by_user_id: overrides.created_by_user_id ?? n,
    created_at: baseTime,
    ...overrides
  };
}

export function buildLeagueMember(overrides: Partial<LeagueMember> = {}): LeagueMember {
  const n = nextSeq();
  return {
    id: n,
    league_id: overrides.league_id ?? n,
    user_id: overrides.user_id ?? n,
    role: overrides.role ?? "MEMBER",
    joined_at: baseTime,
    ...overrides
  };
}

export function buildDraft(overrides: Partial<Draft> = {}): Draft {
  const n = nextSeq();
  return {
    id: n,
    league_id: overrides.league_id ?? n,
    season_id: overrides.season_id ?? overrides.league_id ?? n,
    status: overrides.status ?? "PENDING",
    draft_order_type: overrides.draft_order_type ?? "SNAKE",
    current_pick_number: overrides.current_pick_number ?? null,
    picks_per_seat: overrides.picks_per_seat ?? null,
    version: overrides.version ?? 0,
    started_at: overrides.started_at ?? null,
    completed_at: overrides.completed_at ?? null,
    ...overrides
  };
}

export function buildSeason(overrides: Partial<Season> = {}): Season {
  const n = nextSeq();
  return {
    id: n,
    league_id: overrides.league_id ?? n,
    ceremony_id: overrides.ceremony_id ?? n,
    status: overrides.status ?? "EXTANT",
    scoring_strategy_name: overrides.scoring_strategy_name ?? "fixed",
    created_at: overrides.created_at ?? baseTime,
    ...overrides
  };
}

export function buildDraftSeat(overrides: Partial<DraftSeat> = {}): DraftSeat {
  const n = nextSeq();
  return {
    id: n,
    draft_id: overrides.draft_id ?? n,
    league_member_id: overrides.league_member_id ?? n,
    seat_number: overrides.seat_number ?? 1,
    is_active: overrides.is_active ?? true,
    ...overrides
  };
}

export function buildDraftPick(overrides: Partial<DraftPick> = {}): DraftPick {
  const n = nextSeq();
  return {
    id: n,
    draft_id: overrides.draft_id ?? n,
    pick_number: overrides.pick_number ?? 1,
    round_number: overrides.round_number ?? 1,
    seat_number: overrides.seat_number ?? 1,
    league_member_id: overrides.league_member_id ?? n,
    user_id: overrides.user_id ?? n,
    nomination_id: overrides.nomination_id ?? n,
    made_at: overrides.made_at ?? addSeconds(baseTime, n),
    ...overrides
  };
}
