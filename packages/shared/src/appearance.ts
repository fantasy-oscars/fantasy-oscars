/**
 * Appearance: each person's theme of the day, their mode, and the stored value
 * rules. Pure: every input is an argument, nothing is read from the environment.
 */
import {
  BRAND_CATALOG,
  ENABLED_BRAND_IDS,
  STARTING_BRAND,
  isBrandId,
  type BrandCatalogEntry,
  type BrandId,
  type ThemeMode
} from "./brands.js";

export const MODE_PREFERENCES = ["light", "dark", "theme"] as const;
export type ModePreference = (typeof MODE_PREFERENCES)[number];

export const SINGLE_MODE_POLICIES = ["own", "exclude"] as const;
export type SingleModePolicy = (typeof SINGLE_MODE_POLICIES)[number];

/** What each collection has shown since its round began. */
export type DrawRounds = { ceremony: BrandId[]; cinema: BrandId[] };

export type DailyDraw = { day: number; brand: BrandId; rounds: DrawRounds };

export const DRAW_GROUPS = ["cinemaNew", "cinemaSeen", "ceremony"] as const;
export type DrawGroup = (typeof DRAW_GROUPS)[number];
export type GroupPools = Record<DrawGroup, BrandId[]>;

/** Settings that shape the Random draw. */
export type DrawSettings = {
  mode: ModePreference;
  excluded: readonly BrandId[];
  undiscoveredEnabled: boolean;
  singleModePolicy: SingleModePolicy;
};

export type AppearanceSettings = DrawSettings & {
  /** The Fixed theme; null means Random. */
  fixed: BrandId | null;
};

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  mode: "theme",
  excluded: [],
  undiscoveredEnabled: true,
  singleModePolicy: "own",
  fixed: null
};

const CINEMA_GROUP_SHARE = 0.05;

/** 32-bit FNV-1a followed by an avalanche; stable across runtimes. */
export function seedHash(...parts: (string | number)[]): number {
  const input = parts.join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** `seedHash` scaled to [0, 1). */
export function seedFraction(...parts: (string | number)[]): number {
  return seedHash(...parts) / 4_294_967_296;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function enabledEntries(
  catalog: readonly BrandCatalogEntry[],
  enabled: readonly BrandId[]
): BrandCatalogEntry[] {
  return catalog.filter((entry) => enabled.includes(entry.id));
}

function knownIds(
  entries: readonly BrandCatalogEntry[],
  discovered: readonly BrandId[]
): Set<BrandId> {
  return new Set(
    entries
      .filter((entry) => entry.id === STARTING_BRAND || discovered.includes(entry.id))
      .map((entry) => entry.id)
  );
}

function emptyPools(pools: GroupPools): boolean {
  return DRAW_GROUPS.every((group) => pools[group].length === 0);
}

/**
 * The three draw pools. Known themes are the enabled ones that are discovered
 * (plus the starting theme); selected is known minus the exclusions; fresh is
 * every enabled theme not yet known, when Undiscovered themes is on.
 */
export function buildGroups(input: {
  catalog?: readonly BrandCatalogEntry[];
  enabled?: readonly BrandId[];
  discovered: readonly BrandId[];
  settings: DrawSettings;
}): GroupPools {
  const catalog = input.catalog ?? BRAND_CATALOG;
  const entries = enabledEntries(catalog, input.enabled ?? ENABLED_BRAND_IDS);
  const known = knownIds(entries, input.discovered);
  const { settings } = input;

  const make = (
    selected: ReadonlySet<BrandId>,
    fresh: ReadonlySet<BrandId>,
    skipSingleMode: boolean
  ): GroupPools => {
    const usable = entries.filter((entry) => !skipSingleMode || entry.modes.length > 1);
    const ids = (pick: (entry: BrandCatalogEntry) => boolean) =>
      usable.filter(pick).map((entry) => entry.id);
    return {
      cinemaNew: ids((e) => e.collection === "cinema" && fresh.has(e.id)),
      cinemaSeen: ids((e) => e.collection === "cinema" && selected.has(e.id)),
      ceremony: ids(
        (e) => e.collection === "ceremony" && (selected.has(e.id) || fresh.has(e.id))
      )
    };
  };

  const selected = new Set([...known].filter((id) => !settings.excluded.includes(id)));
  const fresh = new Set(
    settings.undiscoveredEnabled
      ? entries.filter((entry) => !known.has(entry.id)).map((entry) => entry.id)
      : []
  );

  let pools = make(selected, fresh, false);
  if (settings.mode !== "theme" && settings.singleModePolicy === "exclude") {
    const withoutSingle = make(selected, fresh, true);
    if (!emptyPools(withoutSingle)) pools = withoutSingle;
  }
  // The floor: nothing selected (a release change emptied every option).
  if (emptyPools(pools)) pools = make(known, new Set(), false);
  return pools;
}

/**
 * Whether the Random settings leave at least one option selected (a selected
 * known theme, or any undiscovered one while Undiscovered themes is on).
 */
export function hasRandomSelection(input: {
  catalog?: readonly BrandCatalogEntry[];
  enabled?: readonly BrandId[];
  discovered: readonly BrandId[];
  excluded: readonly BrandId[];
  undiscoveredEnabled: boolean;
}): boolean {
  const entries = enabledEntries(
    input.catalog ?? BRAND_CATALOG,
    input.enabled ?? ENABLED_BRAND_IDS
  );
  const known = knownIds(entries, input.discovered);
  const selected = [...known].some((id) => !input.excluded.includes(id));
  return selected || (input.undiscoveredEnabled && entries.some((e) => !known.has(e.id)));
}

/** Cinema groups keep 5 % each while Ceremony exists; an empty group's share passes on. */
export function groupShares(pools: GroupPools): Record<DrawGroup, number> {
  const cinemaNew = pools.cinemaNew.length > 0 ? CINEMA_GROUP_SHARE : 0;
  const cinemaSeen = pools.cinemaSeen.length > 0 ? CINEMA_GROUP_SHARE : 0;
  if (pools.ceremony.length > 0) {
    return { cinemaNew, cinemaSeen, ceremony: 1 - cinemaNew - cinemaSeen };
  }
  const present = (cinemaNew > 0 ? 1 : 0) + (cinemaSeen > 0 ? 1 : 0);
  if (present === 0) return { cinemaNew: 0, cinemaSeen: 0, ceremony: 0 };
  return {
    cinemaNew: cinemaNew > 0 ? 1 / present : 0,
    cinemaSeen: cinemaSeen > 0 ? 1 / present : 0,
    ceremony: 0
  };
}

/** The first group, in order, whose running share exceeds the roll `r` in [0, 1). */
export function pickGroup(pools: GroupPools, roll: number): DrawGroup {
  const shares = groupShares(pools);
  let total = 0;
  let last: DrawGroup = "ceremony";
  for (const group of DRAW_GROUPS) {
    if (pools[group].length === 0) continue;
    total += shares[group];
    last = group;
    if (roll < total) return group;
  }
  return last;
}

function roundKey(group: DrawGroup): keyof DrawRounds {
  return group === "ceremony" ? "ceremony" : "cinema";
}

function lowestHash(
  identity: string,
  day: number,
  group: DrawGroup,
  candidates: readonly BrandId[]
): BrandId {
  let best = candidates[0]!;
  let bestHash = seedHash(identity, day, group, best);
  for (const brand of candidates.slice(1)) {
    const hash = seedHash(identity, day, group, brand);
    if (hash < bestHash) {
      best = brand;
      bestHash = hash;
    }
  }
  return best;
}

/**
 * The theme for one brand day. Call it only when there is no record for the
 * day; the result is the day's theme once saved.
 */
export function drawDaily(input: {
  identity: string;
  day: number;
  catalog?: readonly BrandCatalogEntry[];
  enabled?: readonly BrandId[];
  discovered: readonly BrandId[];
  settings: DrawSettings;
  previous: DailyDraw | null;
}): DailyDraw {
  const { identity, day, previous } = input;
  const pools = buildGroups(input);
  const group = pickGroup(pools, seedFraction(identity, day, "group"));
  const pool = pools[group];
  if (pool.length === 0) throw new Error("No themes are available to draw");

  const key = roundKey(group);
  const rounds: DrawRounds = {
    ceremony: [...(previous?.rounds.ceremony ?? [])],
    cinema: [...(previous?.rounds.cinema ?? [])]
  };
  const yesterday = previous?.brand ?? null;

  let eligible = pool.filter((id) => !rounds[key].includes(id) && id !== yesterday);
  let round = rounds[key];
  if (eligible.length === 0) {
    eligible = pool.filter((id) => id !== yesterday);
    if (eligible.length === 0) eligible = pool;
    round = [];
  }
  const brand = lowestHash(identity, day, group, eligible);
  rounds[key] = [...round, brand];
  return { day, brand, rounds };
}

export type ShuffleResult = { brand: BrandId; rounds: DrawRounds };

/**
 * One wordmark shuffle: the same groups and odds as the daily draw, never the
 * current theme. Under Fixed the groups are every discovered theme (no
 * exclusions, nothing undiscovered). `rounds` is the day's shuffle memory, or
 * null for the first shuffle of the day, when `current` starts its
 * collection's round. `seq` is the number of shuffles already done today (0 for the first).
 * Returns null when nothing but `current` is left to show.
 */
export function drawShuffle(input: {
  identity: string;
  day: number;
  catalog?: readonly BrandCatalogEntry[];
  enabled?: readonly BrandId[];
  discovered: readonly BrandId[];
  settings: AppearanceSettings;
  current: BrandId;
  rounds: DrawRounds | null;
  seq: number;
}): ShuffleResult | null {
  const { identity, day, current, seq } = input;
  const catalog = input.catalog ?? BRAND_CATALOG;
  const settings: DrawSettings = input.settings.fixed
    ? { ...input.settings, excluded: [], undiscoveredEnabled: false }
    : input.settings;
  const built = buildGroups({ ...input, catalog, settings });
  const pools: GroupPools = {
    cinemaNew: built.cinemaNew.filter((id) => id !== current),
    cinemaSeen: built.cinemaSeen.filter((id) => id !== current),
    ceremony: built.ceremony.filter((id) => id !== current)
  };
  if (emptyPools(pools)) return null;

  let rounds: DrawRounds;
  if (input.rounds) {
    rounds = { ceremony: [...input.rounds.ceremony], cinema: [...input.rounds.cinema] };
  } else {
    rounds = { ceremony: [], cinema: [] };
    const entry = catalog.find((candidate) => candidate.id === current);
    if (entry)
      rounds[entry.collection === "ceremony" ? "ceremony" : "cinema"] = [current];
  }

  const group = pickGroup(pools, seedFraction(identity, day, "shuffle", seq, "group"));
  const key = roundKey(group);
  const eligible = pools[group].filter((id) => !rounds[key].includes(id));
  const fromNewRound = eligible.length === 0;
  const candidates = fromNewRound ? pools[group] : eligible;

  let brand = candidates[0]!;
  let best = seedHash(identity, day, "shuffle", seq, group, brand);
  for (const candidate of candidates.slice(1)) {
    const hash = seedHash(identity, day, "shuffle", seq, group, candidate);
    if (hash < best) {
      brand = candidate;
      best = hash;
    }
  }
  rounds[key] = fromNewRound ? [brand] : [...rounds[key], brand];
  return { brand, rounds };
}

/** `theme` is the primary mode; light or dark pick the first mode on that base. */
export function resolveMode(
  preference: ModePreference,
  entry: Pick<BrandCatalogEntry, "modes">
): ThemeMode {
  if (preference === "theme") return entry.modes[0];
  return entry.modes.find((mode) => mode.base === preference) ?? entry.modes[0];
}

export type ResolvedAppearance = {
  brand: BrandId;
  mode: ThemeMode;
  /** The record in effect: today's saved one or the one just drawn; null for Fixed and shuffles. */
  draw: DailyDraw | null;
  /** True when `draw` was drawn now and still needs saving. */
  drewNow: boolean;
};

/**
 * Precedence: shuffle for today, Fixed theme, today's record, a new draw. The
 * mode is then resolved for the resulting theme.
 */
export function resolveAppearance(input: {
  identity: string;
  day: number;
  catalog?: readonly BrandCatalogEntry[];
  enabled?: readonly BrandId[];
  discovered: readonly BrandId[];
  settings: AppearanceSettings;
  record: DailyDraw | null;
  shuffle?: BrandId | null;
}): ResolvedAppearance {
  const catalog = input.catalog ?? BRAND_CATALOG;
  const enabled = input.enabled ?? ENABLED_BRAND_IDS;
  const { settings, record } = input;
  const entryFor = (brand: BrandId): BrandCatalogEntry => {
    const entry = catalog.find((candidate) => candidate.id === brand);
    if (!entry) throw new Error(`Unknown theme: ${brand}`);
    return entry;
  };
  const finish = (
    brand: BrandId,
    draw: DailyDraw | null,
    drewNow: boolean
  ): ResolvedAppearance => ({
    brand,
    mode: resolveMode(settings.mode, entryFor(brand)),
    draw,
    drewNow
  });

  if (input.shuffle && enabled.includes(input.shuffle)) {
    return finish(input.shuffle, null, false);
  }
  if (settings.fixed && enabled.includes(settings.fixed)) {
    return finish(settings.fixed, null, false);
  }
  if (record && record.day >= input.day && enabled.includes(record.brand)) {
    return finish(record.brand, record, false);
  }
  const draw = drawDaily({
    identity: input.identity,
    day: input.day,
    catalog,
    enabled,
    discovered: input.discovered,
    settings,
    previous: record
  });
  return finish(draw.brand, draw, true);
}

export type ParsedAppearance = {
  settings: AppearanceSettings;
  /** Released discoveries as stored (the starting theme is never stored). */
  discovered: BrandId[];
  draw: DailyDraw | null;
  /** `mode_preference` was NULL, so the legacy light or dark choice may be copied. */
  modeUnset: boolean;
  /** The stored Fixed theme is not released, so Random applies for now. */
  fixedUnavailable: boolean;
};

/** A plain object: not null, not an array. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function releasedIds(value: unknown, enabled: readonly BrandId[]): BrandId[] {
  if (!Array.isArray(value)) return [];
  return unique(
    value.filter((item): item is BrandId => isBrandId(item) && enabled.includes(item))
  );
}

function parseDraw(value: unknown, enabled: readonly BrandId[]): DailyDraw | null {
  if (!isRecord(value)) return null;
  const { day, brand, rounds } = value;
  if (typeof day !== "number" || !Number.isInteger(day)) return null;
  if (!isBrandId(brand) || !enabled.includes(brand)) return null;
  const roundsRecord = isRecord(rounds) ? rounds : {};
  return {
    day,
    brand,
    rounds: {
      ceremony: releasedIds(roundsRecord.ceremony, enabled),
      cinema: releasedIds(roundsRecord.cinema, enabled)
    }
  };
}

/**
 * Turn stored values (the `brand_preference` column and the `appearance`
 * object from the API) into settings. Unknown or unreleased values are
 * filtered here and never rewritten.
 */
export function parseAppearance(
  input: { brand_preference?: unknown; appearance?: unknown },
  enabled: readonly BrandId[] = ENABLED_BRAND_IDS
): ParsedAppearance {
  const stored = isRecord(input.appearance) ? input.appearance : {};

  const preference = input.brand_preference;
  const fixedUnavailable = isBrandId(preference) && !enabled.includes(preference);
  const fixed = isBrandId(preference) && enabled.includes(preference) ? preference : null;

  const mode = stored.mode_preference;
  const modePreference = (MODE_PREFERENCES as readonly unknown[]).includes(mode)
    ? (mode as ModePreference)
    : "theme";
  const policy = stored.single_mode_policy;
  const singleModePolicy = (SINGLE_MODE_POLICIES as readonly unknown[]).includes(policy)
    ? (policy as SingleModePolicy)
    : "own";

  return {
    settings: {
      fixed,
      mode: modePreference,
      excluded: releasedIds(stored.random_excluded_brands, enabled),
      undiscoveredEnabled:
        typeof stored.undiscovered_enabled === "boolean"
          ? stored.undiscovered_enabled
          : true,
      singleModePolicy
    },
    discovered: releasedIds(stored.discovered_brands, enabled),
    draw: parseDraw(stored.daily_draw, enabled),
    modeUnset: mode === null || mode === undefined,
    fixedUnavailable
  };
}
