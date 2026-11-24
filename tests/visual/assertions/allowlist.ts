import type { Finding } from "./pageChecks";

/**
 * Pre-existing layout failures of the screen sweep, each with a reason and a date. The
 * sweep runs in the probe-stress theme only, so an entry is scoped by screen and viewport.
 * An entry that no longer matches any finding fails the run, so fix the app and delete the
 * entry in one change. Keep entries specific: a check, a screen, a viewport and part of the
 * element's description. Do not add an entry for a failure a change introduced; fix the
 * change.
 */
export type AllowlistEntry = {
  check: Finding["check"];
  /** Screen id, a list of screen ids, or "*". */
  screen: string | readonly string[];
  viewport: "desktop" | "mobile" | "*";
  /** Part of the finding's description; omit to match every finding of the check. */
  match?: string;
  reason: string;
  /** ISO date the entry was recorded. */
  date: string;
};

const DRAFT_ROOM_SCREENS = [
  "draft-live-countdown",
  "draft-live-not-your-turn",
  "draft-live-your-turn",
  "draft-paused",
  "draft-pending-not-live"
] as const;

const DRAFT_POOL_PILL_SCREENS = [...DRAFT_ROOM_SCREENS, "draft-completed"] as const;

/** Season draft cells whose pills open the phone nominee card on a tap. */
const SEASON_DRAFT_PILL_SCREENS = [
  "circuit-draft-board",
  "circuit-draft-board-category",
  "circuit-draft-staging",
  "circuit-draft-card"
] as const;

/** Season pages whose pills open the phone nominee card (or a claim's edit modal) on a tap. */
const SEASON_PAGE_PILL_SCREENS = [
  "circuit-roster-own",
  "circuit-roster-window",
  "circuit-roster-other",
  "circuit-transactions",
  "circuit-waivers",
  "circuit-waivers-window",
  "circuit-waivers-processing",
  "circuit-points-player",
  "circuit-points-category",
  "circuit-standings-final",
  "circuit-standings-final-rosters"
] as const;

export const ALLOWLIST: readonly AllowlistEntry[] = [
  {
    check: "touch-target",
    screen: "specimen",
    viewport: "mobile",
    match: "Dismiss announcement",
    reason:
      "The announcement banner's close button is Mantine's 20px default on a phone. Found when the specimen gained the banner variants; the fix (a 44px close target in the banner skin) is follow-up banner-dismiss-touch-target.",
    date: "2026-11-15"
  },
  {
    check: "touch-target",
    screen: ["admin-films", "specimen"],
    viewport: "mobile",
    match: "Checkbox-input",
    reason: "The row or label is the target; the box is a visual mark.",
    date: "2026-11-09"
  },
  {
    check: "touch-target",
    screen: "admin-ceremony-nominees",
    viewport: "mobile",
    match: "nomination-drag-handle-button",
    reason:
      "Admin-only, one operator; the drag handle needs keyboard reordering rework first (a carried item).",
    date: "2026-11-09"
  },
  {
    check: "touch-target",
    screen: "admin-ceremony-nominees",
    viewport: "mobile",
    match: "mantine-Stepper-step",
    reason: "Admin-only and dense by design; 44px per step adds a screen of chrome.",
    date: "2026-11-09"
  },
  {
    check: "touch-target",
    screen: [
      ...DRAFT_POOL_PILL_SCREENS,
      ...SEASON_DRAFT_PILL_SCREENS,
      ...SEASON_PAGE_PILL_SCREENS,
      "specimen"
    ],
    viewport: "mobile",
    match: "dr-pill",
    reason:
      "22px plus 6px gaps meets WCAG 2.5.8 by spacing; a tap only opens the sheet, whose Draft button is 44px. The completed-draft roster board opens the same sheet, and so do the season room's staging rows (44px tall) and board, and the season roster, transaction, waiver result, points and final results pills (rows 44px tall on a phone, or a tap opens the card). A claim pill opens its edit modal instead, on a 44px claim row.",
    date: "2026-11-09"
  },
  {
    check: "touch-target",
    screen: [...DRAFT_ROOM_SCREENS, "specimen"],
    viewport: "mobile",
    match: "dr-card-titleRow",
    reason: "It is the keyboard entry to pill mode; touch users tap pills directly.",
    date: "2026-11-09"
  },
  {
    check: "touch-target",
    screen: [
      "season-create-choice",
      "season-create-full-unavailable",
      "season-create-ceremony",
      "season-create-ceremony-coming-soon",
      "season-create-full",
      "season-create-full-coming-soon",
      "season-create-full-select",
      "season-create-full-scoring-open",
      "season-create-full-events-open"
    ],
    viewport: "mobile",
    match: "mantine-Radio-radio",
    reason:
      "The option's label and description are the target, at least 44px tall; the ring is a visual mark.",
    date: "2026-11-17"
  },
  {
    check: "touch-target",
    screen: [
      "season-create-full-unavailable",
      "season-create-ceremony",
      "season-create-ceremony-coming-soon"
    ],
    viewport: "mobile",
    match: "mantine-NumberInput-control",
    reason:
      "The single-ceremony form's Seconds per pick accepts typing on touch; the steppers are a convenience.",
    date: "2026-11-17"
  },
  {
    check: "touch-target",
    screen: "specimen",
    viewport: "mobile",
    match: "mantine-NumberInput-control",
    reason: "The field accepts typing on touch; the steppers are a convenience.",
    date: "2026-11-09"
  },
  {
    check: "touch-target",
    screen: ["specimen", "circuit-draft-card"],
    viewport: "mobile",
    match: "fo-tip-tmdbLink",
    reason:
      "The TMDB attribution link in the nominee card's footer; the card is read-only information on phone. Follow-up: tmdb-link-touch-target.",
    date: "2026-11-15"
  }
];

export type Scope = { screen: string; viewport: string };

export function entryMatches(entry: AllowlistEntry, scope: Scope, finding: Finding) {
  const same = (want: string, got: string) => want === "*" || want === got;
  const screenMatches =
    typeof entry.screen === "string"
      ? same(entry.screen, scope.screen)
      : entry.screen.includes(scope.screen);
  return (
    entry.check === finding.check &&
    screenMatches &&
    same(entry.viewport, scope.viewport) &&
    (entry.match === undefined || finding.description.includes(entry.match))
  );
}

/**
 * Pre-existing contrast rule failures: a registry pair (part of its key, as the failure
 * prints it) allowed to miss its threshold in one theme or every theme, with a reason and a
 * date. An exception that no longer matches a failure of its theme fails that theme's test.
 */
export type ContrastException = {
  /** Theme id (`slug/mode`) or "*". */
  theme: string;
  /** Part of the pair's key. */
  pair: string;
  reason: string;
  /** ISO date the exception was recorded. */
  date: string;
};

/** The old tier had no contrast entries, so none were migrated. */
export const CONTRAST_EXCEPTIONS: readonly ContrastException[] = [];
