import {
  BRAND_CATALOG,
  BRAND_COLLECTIONS,
  BRAND_IDS,
  BRAND_LABELS,
  ENABLED_BRAND_IDS,
  STARTING_BRAND,
  isBrandId,
  type BrandCatalogEntry,
  type BrandCollection,
  type BrandId,
  type ThemeMode
} from "@fantasy-oscars/shared/brands";
import {
  hasRandomSelection,
  resolveAppearance,
  resolveMode,
  type DailyDraw,
  type ModePreference,
  type ParsedAppearance,
  type SingleModePolicy
} from "@fantasy-oscars/shared/appearance";

export type LegacyMode = "light" | "dark";

/** A value the legacy colour toggle may have stored; anything else is ignored. */
export function parseLegacyMode(raw: string | null): LegacyMode | null {
  return raw === "light" || raw === "dark" ? raw : null;
}

export type AccountMerge = {
  /** Browser discoveries the account lacks. */
  addDiscovered: BrandId[];
  /** The legacy light or dark choice, when the account has no mode yet. */
  mode: LegacyMode | null;
};

/**
 * What a signed-in boot sends on top of the account's own values: discoveries
 * kept in this browser that the account does not have yet, and the legacy
 * light or dark choice when `mode_preference` is still NULL.
 */
export function pendingAccountMerge(input: {
  account: Pick<ParsedAppearance, "discovered" | "modeUnset">;
  queue: readonly unknown[];
  legacyMode: LegacyMode | null;
}): AccountMerge {
  const have = new Set<BrandId>(input.account.discovered);
  const addDiscovered = [
    ...new Set(
      input.queue.filter(
        (id): id is BrandId => isBrandId(id) && id !== STARTING_BRAND && !have.has(id)
      )
    )
  ];
  return {
    addDiscovered,
    mode: input.account.modeUnset ? input.legacyMode : null
  };
}

/* ---------------------------------------------------------------------------
 * The Appearance section (prescription 05, 4.8)
 * ------------------------------------------------------------------------- */

/** Value of the "Undiscovered themes" option in the Random list. */
export const UNDISCOVERED_VALUE = "undiscovered";

export type AppearanceSelection = "random" | "fixed";

/** The saved or optimistic values the section is built from. */
export type AppearanceState = Pick<
  ParsedAppearance,
  "settings" | "discovered" | "draw" | "fixedUnavailable"
>;

/** A partial body for PATCH /auth/me/preferences; only provided fields are written. */
export type AppearancePatch = {
  brand_preference?: string | null;
  mode_preference?: ModePreference;
  random_excluded_brands?: BrandId[];
  undiscovered_enabled?: boolean;
  single_mode_policy?: SingleModePolicy;
  add_discovered_brands?: BrandId[];
  daily_draw?: DailyDraw;
};

export type AppearanceOption = { value: string; label: string; disabled?: boolean };
export type AppearanceOptionGroup = { group: string; items: AppearanceOption[] };

export type AppearanceView = {
  mode: {
    value: ModePreference;
    options: AppearanceOption[];
    helper: string;
    /** Shown under Mode when the Fixed theme has a single mode. */
    note: string | null;
  };
  selection: {
    value: AppearanceSelection;
    options: AppearanceOption[];
    helper: string;
    /** Shown when a stored Fixed theme is not released. */
    note: string | null;
  };
  /** Present under Fixed. */
  fixed: { value: BrandId; data: AppearanceOptionGroup[] } | null;
  /** Present under Random. */
  random: {
    value: string[];
    data: (AppearanceOption | AppearanceOptionGroup)[];
    /** One option is selected, so it cannot be removed. */
    atFloor: boolean;
    helper: string | null;
  } | null;
  /** Rendered only when it can matter. */
  conflict: {
    value: SingleModePolicy;
    options: AppearanceOption[];
    helper: string;
  } | null;
};

export const APPEARANCE_COPY = {
  modeHelper: "Theme default uses the mode each theme was designed for.",
  randomHelper:
    "A new theme each day, picked from the themes below. Changes here apply from your next daily theme.",
  fixedHelper: "The same theme every day.",
  conflictHelper: "Some themes come in only one mode.",
  fixedUnavailable: "Your fixed theme isn't available right now, so we're using Random.",
  discoveryHelper: "Themes appear here once you've seen them.",
  floorHelper: "At least one option stays selected.",
  saveFailed: "Couldn't save your appearance settings. Your previous settings are back."
} as const;

const COLLECTION_HEADINGS: Record<BrandCollection, string> = {
  ceremony: "Ceremony",
  cinema: "Cinema"
};

const MODE_OPTIONS: AppearanceOption[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "theme", label: "Theme default" }
];

const SELECTION_OPTIONS: AppearanceOption[] = [
  { value: "random", label: "Random" },
  { value: "fixed", label: "Fixed" }
];

const POLICY_OPTIONS: AppearanceOption[] = [
  { value: "own", label: "Use the theme's own mode" },
  { value: "exclude", label: "Leave those themes out" }
];

type CatalogContext = {
  catalog?: readonly BrandCatalogEntry[];
  enabled?: readonly BrandId[];
  labels?: Readonly<Record<string, string>>;
};

function resolveContext(context: CatalogContext) {
  const enabled = context.enabled ?? ENABLED_BRAND_IDS;
  const entries = (context.catalog ?? BRAND_CATALOG).filter((entry) =>
    enabled.includes(entry.id)
  );
  const labels: Readonly<Record<string, string>> = context.labels ?? BRAND_LABELS;
  return {
    catalog: context.catalog ?? BRAND_CATALOG,
    enabled,
    entries,
    label: (id: string) => labels[id] ?? id
  };
}

/** Released themes the person has seen, in catalog order. */
function knownEntries(
  entries: readonly BrandCatalogEntry[],
  discovered: readonly BrandId[]
) {
  return entries.filter((e) => e.id === STARTING_BRAND || discovered.includes(e.id));
}

function groupItems(
  entries: readonly BrandCatalogEntry[],
  label: (id: string) => string,
  disabled?: (id: BrandId) => boolean
): AppearanceOptionGroup[] {
  return BRAND_COLLECTIONS.flatMap((collection) => {
    const items = entries
      .filter((e) => e.collection === collection)
      .map((e) => ({
        value: e.id,
        label: label(e.id),
        ...(disabled?.(e.id) ? { disabled: true } : {})
      }));
    return items.length > 0 ? [{ group: COLLECTION_HEADINGS[collection], items }] : [];
  });
}

/**
 * Everything the Appearance section shows: options, headings, the floor, whether
 * the conflict control is rendered, and the notes under each control.
 */
export function deriveAppearanceView(
  state: AppearanceState,
  context: CatalogContext = {}
): AppearanceView {
  const { entries, label } = resolveContext(context);
  const { settings } = state;
  const known = knownEntries(entries, state.discovered);
  const fixedEntry = settings.fixed
    ? (entries.find((e) => e.id === settings.fixed) ?? null)
    : null;
  const selection: AppearanceSelection = fixedEntry ? "fixed" : "random";

  const modeNote =
    fixedEntry && fixedEntry.modes.length === 1
      ? `${label(fixedEntry.id)} has one mode, so this setting doesn't change it.`
      : null;

  let fixed: AppearanceView["fixed"] = null;
  let random: AppearanceView["random"] = null;

  if (fixedEntry) {
    // A stored Fixed theme the person has not met still appears in the list.
    const listed = known.some((e) => e.id === fixedEntry.id)
      ? known
      : entries.filter((e) => e.id === fixedEntry.id || known.includes(e));
    fixed = { value: fixedEntry.id, data: groupItems(listed, label) };
  } else {
    const showUndiscovered = entries.some((e) => !known.includes(e));
    const undiscoveredOn = showUndiscovered && settings.undiscoveredEnabled;
    let selectedKnown = known.filter((e) => !settings.excluded.includes(e.id));
    // The floor at read time: a release change emptied every option.
    if (selectedKnown.length === 0 && !undiscoveredOn) selectedKnown = known;

    const value = [
      ...(undiscoveredOn ? [UNDISCOVERED_VALUE] : []),
      ...selectedKnown.map((e) => e.id as string)
    ];
    const atFloor = value.length === 1;
    const isLast = (id: string) => atFloor && value[0] === id;
    random = {
      value,
      atFloor,
      data: [
        ...(showUndiscovered
          ? [
              {
                value: UNDISCOVERED_VALUE,
                label: "Undiscovered themes",
                ...(isLast(UNDISCOVERED_VALUE) ? { disabled: true } : {})
              }
            ]
          : []),
        ...groupItems(known, label, (id) => isLast(id))
      ],
      helper: atFloor
        ? APPEARANCE_COPY.floorHelper
        : showUndiscovered
          ? APPEARANCE_COPY.discoveryHelper
          : null
    };
  }

  const conflictVisible =
    settings.mode !== "theme" &&
    selection === "random" &&
    known.some((e) => e.modes.length === 1);

  return {
    mode: {
      value: settings.mode,
      options: MODE_OPTIONS,
      helper: APPEARANCE_COPY.modeHelper,
      note: modeNote
    },
    selection: {
      value: selection,
      options: SELECTION_OPTIONS,
      helper:
        selection === "fixed"
          ? APPEARANCE_COPY.fixedHelper
          : APPEARANCE_COPY.randomHelper,
      note: state.fixedUnavailable ? APPEARANCE_COPY.fixedUnavailable : null
    },
    fixed,
    random,
    conflict: conflictVisible
      ? {
          value: settings.singleModePolicy,
          options: POLICY_OPTIONS,
          helper: APPEARANCE_COPY.conflictHelper
        }
      : null
  };
}

/**
 * A change to the Random list. Rejected (null) when it would leave no option
 * selected; otherwise only the fields that changed. Exclusions for themes the
 * person has not met are kept as they are.
 */
export function applyRandomListChange(
  state: AppearanceState,
  next: readonly string[],
  context: CatalogContext = {}
): Pick<AppearancePatch, "random_excluded_brands" | "undiscovered_enabled"> | null {
  const { catalog, enabled, entries } = resolveContext(context);
  const { settings } = state;
  const known = knownEntries(entries, state.discovered);
  const showUndiscovered = entries.some((e) => !known.includes(e));

  const keptStale = settings.excluded.filter((id) => !known.some((e) => e.id === id));
  const dropped = known.filter((e) => !next.includes(e.id)).map((e) => e.id);
  const excluded = BRAND_IDS.filter((id) => [...keptStale, ...dropped].includes(id));
  const undiscoveredEnabled = showUndiscovered
    ? next.includes(UNDISCOVERED_VALUE)
    : settings.undiscoveredEnabled;

  if (
    !hasRandomSelection({
      catalog,
      enabled,
      discovered: state.discovered,
      excluded,
      undiscoveredEnabled
    })
  ) {
    return null;
  }

  const patch: Pick<AppearancePatch, "random_excluded_brands" | "undiscovered_enabled"> =
    {};
  const before = BRAND_IDS.filter((id) => settings.excluded.includes(id));
  if (before.join("|") !== excluded.join("|")) patch.random_excluded_brands = excluded;
  if (undiscoveredEnabled !== settings.undiscoveredEnabled) {
    patch.undiscovered_enabled = undiscoveredEnabled;
  }
  return patch;
}

export type AppearanceChange =
  | { kind: "mode"; mode: ModePreference }
  | { kind: "selection"; selection: AppearanceSelection }
  | { kind: "fixed"; brand: BrandId }
  | { kind: "random-list"; value: readonly string[] }
  | { kind: "policy"; policy: SingleModePolicy };

export type AppearancePlan = {
  patch: AppearancePatch;
  /** The theme and mode to show now; null when the page does not change. */
  page: { brand: BrandId; mode: ThemeMode } | null;
  /** Fixed and Selection changes end a wordmark shuffle. */
  clearShuffle: boolean;
};

/**
 * What one change writes and what it does to the page (the table in 4.8). Pure:
 * the caller sends the patch, repaints and clears the shuffle.
 */
export function planAppearanceChange(
  change: AppearanceChange,
  state: AppearanceState,
  context: CatalogContext & {
    /** The theme on screen. */
    currentBrand: BrandId | null;
    identity: string;
    day: number;
  }
): AppearancePlan | null {
  const { catalog, enabled } = resolveContext(context);
  const { settings } = state;
  const entryFor = (brand: BrandId) => catalog.find((e) => e.id === brand);
  const onPage = (brand: BrandId, preference: ModePreference) => {
    const entry = entryFor(brand);
    return entry ? { brand, mode: resolveMode(preference, entry) } : null;
  };
  const shown = context.currentBrand ?? STARTING_BRAND;

  switch (change.kind) {
    case "mode":
      if (change.mode === settings.mode) return null;
      return {
        patch: { mode_preference: change.mode },
        page: onPage(shown, change.mode),
        clearShuffle: false
      };
    case "policy":
      if (change.policy === settings.singleModePolicy) return null;
      return {
        patch: { single_mode_policy: change.policy },
        page: null,
        clearShuffle: false
      };
    case "random-list": {
      const patch = applyRandomListChange(state, change.value, context);
      if (!patch || Object.keys(patch).length === 0) return null;
      return { patch, page: null, clearShuffle: false };
    }
    case "fixed":
      if (!enabled.includes(change.brand) || change.brand === settings.fixed) return null;
      return {
        patch: { brand_preference: change.brand },
        page: onPage(change.brand, settings.mode),
        clearShuffle: true
      };
    case "selection": {
      if (change.selection === "fixed") {
        if (settings.fixed) return null;
        return {
          patch: { brand_preference: shown },
          page: onPage(shown, settings.mode),
          clearShuffle: true
        };
      }
      if (!settings.fixed && !state.fixedUnavailable) return null;
      // Back to Random: today's record, or a draw now.
      const resolved = resolveAppearance({
        identity: context.identity,
        day: context.day,
        catalog,
        enabled,
        discovered: state.discovered,
        settings: { ...settings, fixed: null },
        record: state.draw
      });
      const known = new Set<BrandId>([STARTING_BRAND, ...state.discovered]);
      const patch: AppearancePatch = { brand_preference: "random" };
      if (resolved.drewNow && resolved.draw) {
        patch.daily_draw = resolved.draw;
        if (!known.has(resolved.brand)) patch.add_discovered_brands = [resolved.brand];
      }
      return {
        patch,
        page: { brand: resolved.brand, mode: resolved.mode },
        clearShuffle: true
      };
    }
  }
}

/**
 * The theme and mode the page should show for these values without drawing: the
 * Fixed theme, else today's record, else the theme already on screen. Used to
 * paint saved values back after a failed save, and to paint a retried change.
 */
export function pageForValues(
  state: AppearanceState,
  context: CatalogContext & { currentBrand: BrandId | null; day: number }
): { brand: BrandId; mode: ThemeMode } | null {
  const { catalog, enabled } = resolveContext(context);
  const { settings, draw } = state;
  const brand =
    settings.fixed && enabled.includes(settings.fixed)
      ? settings.fixed
      : draw && draw.day >= context.day && enabled.includes(draw.brand)
        ? draw.brand
        : (context.currentBrand ?? STARTING_BRAND);
  const entry = catalog.find((e) => e.id === brand);
  return entry ? { brand, mode: resolveMode(settings.mode, entry) } : null;
}

/** Later fields replace earlier ones; discoveries add up. */
export function mergeAppearancePatches(
  first: AppearancePatch,
  second: AppearancePatch
): AppearancePatch {
  const merged: AppearancePatch = { ...first, ...second };
  const added = [
    ...new Set([
      ...(first.add_discovered_brands ?? []),
      ...(second.add_discovered_brands ?? [])
    ])
  ];
  if (added.length > 0) merged.add_discovered_brands = added;
  return merged;
}

/** The values as they will be once `patch` is saved (the optimistic view). */
export function applyAppearancePatch(
  state: AppearanceState,
  patch: AppearancePatch,
  enabled: readonly BrandId[] = ENABLED_BRAND_IDS
): AppearanceState {
  const settings = { ...state.settings };
  let fixedUnavailable = state.fixedUnavailable;
  if (patch.brand_preference !== undefined) {
    const next = patch.brand_preference;
    settings.fixed = isBrandId(next) && enabled.includes(next) ? next : null;
    fixedUnavailable = isBrandId(next) && !enabled.includes(next);
  }
  if (patch.mode_preference) settings.mode = patch.mode_preference;
  if (patch.random_excluded_brands) settings.excluded = patch.random_excluded_brands;
  if (patch.undiscovered_enabled !== undefined) {
    settings.undiscoveredEnabled = patch.undiscovered_enabled;
  }
  if (patch.single_mode_policy) settings.singleModePolicy = patch.single_mode_policy;
  return {
    settings,
    fixedUnavailable,
    discovered: [
      ...new Set([...state.discovered, ...(patch.add_discovered_brands ?? [])])
    ],
    draw: patch.daily_draw ?? state.draw
  };
}

export type SaveStatus = "idle" | "saving" | "saved";

export function saveStatusText(status: SaveStatus): string {
  return status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "";
}

/** The parts of a click the wordmark rule reads. */
export type WordmarkClick = {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  /** The path before navigation; a query string or hash is not part of it. */
  pathname: string;
};

/**
 * A plain primary click on the wordmark while already on Home shuffles the
 * theme. Every other click is an ordinary link click, so the click that arrives
 * at Home from another page never shuffles.
 */
export function decideWordmarkShuffle(click: WordmarkClick): boolean {
  return (
    click.button === 0 &&
    !click.metaKey &&
    !click.ctrlKey &&
    !click.shiftKey &&
    !click.altKey &&
    click.pathname === "/"
  );
}
