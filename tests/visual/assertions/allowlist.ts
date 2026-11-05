import type { Finding } from "./pageChecks";

/**
 * Pre-existing assertion failures, each with a reason and a date. An entry that no longer
 * matches any finding fails the run, so fix the app and delete the entry in one change.
 * Keep entries specific: a check, a screen, a scope and part of the element's description.
 * Do not add an entry for a failure a change introduced; fix the change.
 */
export type AllowlistEntry = {
  check: Finding["check"];
  /** Screen id, a list of screen ids, or "*". */
  screen: string | readonly string[];
  /** Brand id from the matrix (`default` is refined-gold), or "*". */
  brand: string;
  mode: "light" | "dark" | "*";
  viewport: "desktop" | "mobile" | "*";
  /** Part of the finding's description; omit to match every finding of the check. */
  match?: string;
  reason: string;
  /** ISO date the entry was recorded. */
  date: string;
};

const FOOTER_SCREENS = [
  "account",
  "admin-ceremony-nominees",
  "admin-films",
  "admin-home",
  "ceremonies-index",
  "ceremony-detail",
  "ceremony-detail-results",
  "draft-plans",
  "home-logged-in",
  "home-logged-out",
  "home-new-user",
  "league-detail",
  "leagues-empty",
  "leagues-list",
  "not-found",
  "season-completed",
  "season-live",
  "season-pending"
] as const;
const DRAFT_ROOM_SCREENS = [
  "draft-live-countdown",
  "draft-live-not-your-turn",
  "draft-live-your-turn",
  "draft-paused"
] as const;

export const ALLOWLIST: readonly AllowlistEntry[] = [
  {
    check: "clipped-text",
    screen: "draft-completed",
    brand: "*",
    mode: "*",
    viewport: "*",
    match: "dr-card-title",
    reason:
      "A very long username truncates in the draft card title without exposing the full name.",
    date: "2026-11-05"
  },
  {
    check: "clipped-text",
    screen: "draft-completed",
    brand: "*",
    mode: "*",
    viewport: "*",
    match: "drh-buckleCenter",
    reason:
      "A very long username truncates in the header buckle without exposing the full name.",
    date: "2026-11-05"
  },
  {
    check: "clipped-text",
    screen: "draft-completed",
    brand: "*",
    mode: "*",
    viewport: "*",
    match: "drm-podiumText",
    reason:
      "A very long username truncates in the podium text without exposing the full name.",
    date: "2026-11-05"
  },
  {
    check: "contrast",
    screen: [
      "draft-live-armed",
      "draft-live-countdown",
      "draft-live-your-turn",
      "specimen"
    ],
    brand: "*",
    mode: "light",
    viewport: "*",
    match: "dr-pill-text",
    reason:
      "Muted (drafted or unavailable) nominee pills dim their text below 4.5:1 in light mode; the pill is not actionable.",
    date: "2026-11-05"
  },
  {
    check: "contrast",
    screen: [
      "draft-live-armed",
      "draft-live-countdown",
      "draft-live-your-turn",
      "specimen"
    ],
    brand: "ballot",
    mode: "dark",
    viewport: "*",
    match: "dr-pill-text",
    reason:
      "Muted (drafted or unavailable) nominee pills dim their text below 4.5:1 in ballot dark; the pill is not actionable.",
    date: "2026-11-05"
  },
  {
    check: "touch-target",
    screen: [...FOOTER_SCREENS, "specimen"],
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "mantine-Text-root",
    reason: "Footer text links are 19px tall at 390px.",
    date: "2026-11-05"
  },
  {
    check: "touch-target",
    screen: FOOTER_SCREENS,
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "footer-logo-link",
    reason: "The TMDB footer logo link is 22x16 at 390px.",
    date: "2026-11-05"
  },
  {
    check: "touch-target",
    screen: [
      "admin-ceremony-nominees",
      "admin-films",
      "draft-completed",
      "draft-plans",
      "login",
      "register",
      "specimen"
    ],
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "Input-input",
    reason: "Text, select and number inputs are 36px tall at 390px.",
    date: "2026-11-05"
  },
  {
    check: "touch-target",
    screen: ["home-logged-out", "login", "not-found", "register", "specimen"],
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "a.mantine-focus-auto.brand",
    reason: "The wordmark link is shorter than 44px at 390px.",
    date: "2026-11-05"
  },
  {
    check: "touch-target",
    screen: ["admin-ceremony-nominees", "admin-films", "admin-home"],
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "nav-link",
    reason: "Admin sub-navigation links are 41px tall at 390px.",
    date: "2026-11-05"
  },
  {
    check: "touch-target",
    screen: ["admin-films", "specimen"],
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "Checkbox-input",
    reason: "Row checkboxes are 20x20 at 390px.",
    date: "2026-11-05"
  },
  {
    check: "touch-target",
    screen: "admin-ceremony-nominees",
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "nomination-group-header",
    reason: "Collapsible nominee group headers are 40px tall at 390px.",
    date: "2026-11-05"
  },
  {
    check: "touch-target",
    screen: "admin-ceremony-nominees",
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "nomination-drag-handle-button",
    reason: "Reorder handles are 18x18 at 390px.",
    date: "2026-11-05"
  },
  {
    check: "touch-target",
    screen: "admin-ceremony-nominees",
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "mantine-Stepper-step",
    reason: "Ceremony workflow stepper steps are 32px tall at 390px.",
    date: "2026-11-05"
  },
  {
    check: "touch-target",
    screen: [...DRAFT_ROOM_SCREENS, "specimen"],
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "dr-pill",
    reason: "Draft nominee pills are 22px tall at 390px.",
    date: "2026-11-05"
  },
  {
    check: "touch-target",
    screen: [...DRAFT_ROOM_SCREENS, "specimen"],
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "dr-card-titleRow",
    reason: "Draft category title rows are 20px tall at 390px.",
    date: "2026-11-05"
  },
  {
    check: "touch-target",
    screen: DRAFT_ROOM_SCREENS,
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "dr-mobileRailBtn",
    reason: "Draft rail buttons are 52x40 at 390px.",
    date: "2026-11-05"
  },
  {
    check: "touch-target",
    screen: "specimen",
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "mantine-NumberInput-control",
    reason: "The specimen number input steppers are smaller than 44px at 390px.",
    date: "2026-11-05"
  },
  {
    check: "touch-target",
    screen: "specimen",
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "mantine-Menu-item",
    reason: "The specimen menu items are shorter than 44px at 390px.",
    date: "2026-11-05"
  },
  {
    check: "touch-target",
    screen: "specimen",
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "mantine-active",
    reason: "The specimen's modal action buttons are shorter than 44px at 390px.",
    date: "2026-11-05"
  }
];

export type Scope = { screen: string; brand: string; mode: string; viewport: string };

export function entryMatches(entry: AllowlistEntry, scope: Scope, finding: Finding) {
  const same = (want: string, got: string) => want === "*" || want === got;
  const screenMatches =
    typeof entry.screen === "string"
      ? same(entry.screen, scope.screen)
      : entry.screen.includes(scope.screen);
  return (
    entry.check === finding.check &&
    screenMatches &&
    same(entry.brand, scope.brand) &&
    same(entry.mode, scope.mode) &&
    same(entry.viewport, scope.viewport) &&
    (entry.match === undefined || finding.description.includes(entry.match))
  );
}
