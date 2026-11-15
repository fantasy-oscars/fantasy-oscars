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

const DRAFT_ROOM_SCREENS = [
  "draft-live-countdown",
  "draft-live-not-your-turn",
  "draft-live-your-turn",
  "draft-paused"
] as const;

export const ALLOWLIST: readonly AllowlistEntry[] = [
  {
    check: "touch-target",
    screen: ["admin-films", "specimen"],
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "Checkbox-input",
    reason: "The row or label is the target; the box is a visual mark.",
    date: "2026-11-09"
  },
  {
    check: "touch-target",
    screen: "admin-ceremony-nominees",
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "nomination-drag-handle-button",
    reason:
      "Admin-only, one operator; the drag handle needs keyboard reordering rework first (a carried item).",
    date: "2026-11-09"
  },
  {
    check: "touch-target",
    screen: "admin-ceremony-nominees",
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "mantine-Stepper-step",
    reason: "Admin-only and dense by design; 44px per step adds a screen of chrome.",
    date: "2026-11-09"
  },
  {
    check: "touch-target",
    screen: [...DRAFT_ROOM_SCREENS, "specimen"],
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "dr-pill",
    reason:
      "22px plus 6px gaps meets WCAG 2.5.8 by spacing; a tap only opens the sheet, whose Draft button is 44px.",
    date: "2026-11-09"
  },
  {
    check: "touch-target",
    screen: [...DRAFT_ROOM_SCREENS, "specimen"],
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "dr-card-titleRow",
    reason: "It is the keyboard entry to pill mode; touch users tap pills directly.",
    date: "2026-11-09"
  },
  {
    check: "touch-target",
    screen: "specimen",
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "mantine-NumberInput-control",
    reason: "The field accepts typing on touch; the steppers are a convenience.",
    date: "2026-11-09"
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
