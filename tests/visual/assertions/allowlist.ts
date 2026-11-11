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

/** Every draft screen the room geometry checks run on (a superset of the above). */
const ROOM_SCREENS_DESKTOP = [
  ...DRAFT_ROOM_SCREENS,
  "draft-live-armed",
  "draft-live-hover-match",
  "draft-live-focus-disabled"
] as const;
const ROOM_SCREENS_ALL = [...ROOM_SCREENS_DESKTOP, "draft-completed"] as const;

const CHUNK_2 = "Fixed by draft-room-fixes (chunk 2 of the draft room template).";
const CHUNK_3 =
  "Fixed by draft-room-redesigns (chunk 3 of the draft room template): the phone completed screen moves the podium into the header tab.";
const ROOM_DATE = "2026-11-10";

/** One room entry per brand, so a regression in a brand that passes today still fails. */
function perBrand(
  brands: readonly string[],
  entry: Omit<AllowlistEntry, "brand">
): AllowlistEntry[] {
  return brands.map((brand) => ({ ...entry, brand }));
}

const ROOM_ENTRIES: readonly AllowlistEntry[] = [
  // Pills are always round (5.1); the radius follows the lever after chunk 2.
  {
    check: "room-pill-radius",
    screen: ROOM_SCREENS_ALL,
    brand: "*",
    mode: "*",
    viewport: "*",
    match: ".dr-pill radius",
    reason: CHUNK_2,
    date: ROOM_DATE
  },
  // The drafted chip's avatar mark ignores the on-primary slot (5.3).
  {
    check: "room-chip-avatar",
    screen: ROOM_SCREENS_ALL,
    brand: "*",
    mode: "dark",
    viewport: "*",
    reason: CHUNK_2,
    date: ROOM_DATE
  },
  ...perBrand(["ballot", "festival", "lightbox", "noir", "red-carpet", "technicolor"], {
    check: "room-chip-avatar",
    screen: ROOM_SCREENS_ALL,
    mode: "light",
    viewport: "*",
    reason: CHUNK_2,
    date: ROOM_DATE
  }),
  // The section rule sits outside the header's 64 px box (3 px of rule, more for a double one).
  {
    check: "room-header-height",
    screen: ROOM_SCREENS_DESKTOP,
    brand: "*",
    mode: "*",
    viewport: "desktop",
    reason: CHUNK_2,
    date: ROOM_DATE
  },
  {
    check: "room-header-height",
    screen: "draft-completed",
    brand: "*",
    mode: "*",
    viewport: "mobile",
    reason: CHUNK_3,
    date: ROOM_DATE
  },
  // Pills in the ledger rail start 5 px right of the rail's other rows.
  ...perBrand(
    ["ballot", "default", "festival", "noir", "red-carpet", "technicolor", "stress"],
    {
      check: "room-rail-align",
      screen: ROOM_SCREENS_DESKTOP,
      mode: "*",
      viewport: "desktop",
      reason: CHUNK_2,
      date: ROOM_DATE
    }
  ),
  // Card gaps ignore the ring and drop the lever adds to a card's painted edge.
  ...perBrand(
    ["ballot", "default", "lightbox", "noir", "red-carpet", "technicolor", "stress"],
    {
      check: "room-card-gap",
      screen: ROOM_SCREENS_DESKTOP,
      mode: "*",
      viewport: "desktop",
      reason: CHUNK_2,
      date: ROOM_DATE
    }
  ),
  ...perBrand(["technicolor", "stress"], {
    check: "room-card-gap",
    screen: DRAFT_ROOM_SCREENS,
    mode: "*",
    viewport: "mobile",
    reason: CHUNK_2,
    date: ROOM_DATE
  })
];

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
  },
  ...ROOM_ENTRIES
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
