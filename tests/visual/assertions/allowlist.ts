import type { Finding } from "./pageChecks";

/**
 * Pre-existing assertion failures, each with a reason and a date. An entry that no longer
 * matches any finding fails the run, so fix the app and delete the entry in one change.
 * Keep entries specific: a check, a screen, a scope and part of the element's description.
 * Do not add an entry for a failure a change introduced; fix the change.
 */
export type AllowlistEntry = {
  check: Finding["check"];
  /** Screen id, or "*". */
  screen: string;
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

export const ALLOWLIST: readonly AllowlistEntry[] = [
  {
    check: "clipped-text",
    screen: "admin-ceremony-nominees",
    brand: "*",
    mode: "*",
    viewport: "*",
    match: "mantine-Stepper-step",
    reason:
      "Ceremony workflow stepper labels are clipped in their step buttons at every width; no title or aria-label carries the full label.",
    date: "2026-11-05"
  },
  {
    check: "clipped-text",
    screen: "*",
    brand: "ballot",
    mode: "*",
    viewport: "*",
    match: "fo-chip__label",
    reason:
      "Status chip labels are clipped in the ballot brand with no title exposing the full text.",
    date: "2026-11-05"
  },
  {
    check: "clipped-text",
    screen: "*",
    brand: "lightbox",
    mode: "*",
    viewport: "*",
    match: "fo-chip__label",
    reason:
      "Status chip labels are clipped in the lightbox brand with no title exposing the full text.",
    date: "2026-11-05"
  },
  {
    check: "clipped-text",
    screen: "*",
    brand: "red-carpet",
    mode: "*",
    viewport: "*",
    match: "fo-chip__label",
    reason:
      "Status chip labels are clipped in the red-carpet brand with no title exposing the full text.",
    date: "2026-11-05"
  },
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
    screen: "*",
    brand: "*",
    mode: "*",
    viewport: "*",
    match: "dr-pill-text",
    reason:
      "Muted (drafted or unavailable) nominee pill text is dimmed below 4.5:1 by design; the pill is not actionable.",
    date: "2026-11-05"
  },
  {
    check: "touch-target",
    screen: "*",
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "mantine-Text-root",
    reason: "Footer text links are 19px tall at 390px.",
    date: "2026-11-05"
  },
  {
    check: "touch-target",
    screen: "*",
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "footer-logo-link",
    reason: "The TMDB footer logo link is 22x16 at 390px.",
    date: "2026-11-05"
  },
  {
    check: "touch-target",
    screen: "*",
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "Input-input",
    reason: "Text, select and number inputs are 36px tall at 390px.",
    date: "2026-11-05"
  },
  {
    check: "touch-target",
    screen: "*",
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "a.mantine-focus-auto.brand",
    reason: "The wordmark link is shorter than 44px at 390px.",
    date: "2026-11-05"
  },
  {
    check: "touch-target",
    screen: "*",
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "nav-link",
    reason: "Admin sub-navigation links are 41px tall at 390px.",
    date: "2026-11-05"
  },
  {
    check: "touch-target",
    screen: "*",
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
    screen: "*",
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "dr-pill",
    reason: "Draft nominee pills are 22px tall at 390px.",
    date: "2026-11-05"
  },
  {
    check: "touch-target",
    screen: "*",
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "dr-card-titleRow",
    reason: "Draft category title rows are 20px tall at 390px.",
    date: "2026-11-05"
  },
  {
    check: "touch-target",
    screen: "*",
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "dr-mobileRailBtn",
    reason: "Draft rail buttons are 52x40 at 390px.",
    date: "2026-11-05"
  },
  {
    check: "touch-target",
    screen: "*",
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "mantine-NumberInput-control",
    reason: "Number input steppers are smaller than 44px at 390px.",
    date: "2026-11-05"
  },
  {
    check: "touch-target",
    screen: "*",
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "mantine-Menu-item",
    reason: "Menu items are shorter than 44px at 390px.",
    date: "2026-11-05"
  },
  {
    check: "touch-target",
    screen: "*",
    brand: "*",
    mode: "*",
    viewport: "mobile",
    match: "mantine-active",
    reason:
      "Compact action buttons (Confirm draft pick, header calls to action) are shorter than 44px at 390px.",
    date: "2026-11-05"
  }
];

export type Scope = { screen: string; brand: string; mode: string; viewport: string };

export function entryMatches(entry: AllowlistEntry, scope: Scope, finding: Finding) {
  const same = (want: string, got: string) => want === "*" || want === got;
  return (
    entry.check === finding.check &&
    same(entry.screen, scope.screen) &&
    same(entry.brand, scope.brand) &&
    same(entry.mode, scope.mode) &&
    same(entry.viewport, scope.viewport) &&
    (entry.match === undefined || finding.description.includes(entry.match))
  );
}
