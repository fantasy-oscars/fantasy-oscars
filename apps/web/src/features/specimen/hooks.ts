/**
 * Measurement hooks for the specimen page.
 *
 * `data-specimen` already marks the page itself, so the hooks use `data-spec`:
 * `data-spec="<component>[:<variant>]"` names a representative component and
 * `data-spec-state` names the state that sample is in (`default` when absent). The
 * tolerance tier (tests/visual/tolerances) reads these and nothing else, so a component
 * is found by what it is, not by a CSS class. The hooks are stamped after mount on the
 * real components the page renders; no production component carries them.
 */

export const HOOK_ATTR = "data-spec";
export const STATE_ATTR = "data-spec-state";
/** Set on a `Cell` whose single measured element is found from the cell by `CELL_TARGETS`. */
export const CELL_HOOK_ATTR = "data-spec-cell";
export const CELL_STATE_ATTR = "data-spec-cell-state";

/** The element inside a cell that carries the hook, by component (the part before `:`). */
const CELL_TARGETS: Record<string, string> = {
  button: "button",
  "icon-button": "button",
  input: "input",
  select: "input",
  "number-input": "input",
  checkbox: "input[type='checkbox']",
  switch: ".mantine-Switch-track",
  card: ".baseline-card",
  chip: ".fo-chip",
  "empty-state": ".baseline-emptyState",
  modal: ".mantine-Modal-content",
  toast: ".mantine-Notification-root",
  wordmark: ".site-title"
};

function tag(el: Element, hook: string, state = "default") {
  el.setAttribute(HOOK_ATTR, hook);
  el.setAttribute(STATE_ATTR, state);
}

function tagAll(root: ParentNode, selector: string, hook: (el: Element) => string) {
  for (const el of root.querySelectorAll(selector)) tag(el, hook(el));
}

/** Nominee pill states by aria-label suffix (the label is "<card title>: <state label>"). */
const PILL_STATE_BY_LABEL: Record<string, string> = {
  Default: "default",
  "Hover (match)": "hover-match",
  "Hover (pointer)": "hover",
  Armed: "selected",
  Won: "won",
  "Won and hover": "won-hover",
  "Won and armed": "won-selected",
  Focus: "focus",
  Disabled: "disabled",
  "Not draftable": "not-draftable"
};

/** Stamps every hook on `root`. Idempotent; call after the forced states are applied. */
export function applySpecimenHooks(root: Element) {
  for (const cell of root.querySelectorAll(`[${CELL_HOOK_ATTR}]`)) {
    const hook = cell.getAttribute(CELL_HOOK_ATTR) ?? "";
    // A cell whose hook has no entry only scopes the rules below (the markdown block).
    const selector = CELL_TARGETS[hook.split(":")[0] ?? ""];
    const target = selector ? cell.querySelector(selector) : null;
    if (target) tag(target, hook, cell.getAttribute(CELL_STATE_ATTR) ?? "default");
  }

  const pill = root.querySelector(".fo-headerAccountBtn");
  if (pill) tag(pill, "account-pill");

  for (const link of root.querySelectorAll(`[${CELL_HOOK_ATTR}='nav'] .nav-link`)) {
    const forced = ["hover", "focus"].find((s) =>
      link.classList.contains(`fo-force-${s}`)
    );
    tag(
      link,
      link.classList.contains("active") ? "nav-item:active" : "nav-item:idle",
      forced ?? "default"
    );
  }

  for (const pill of root.querySelectorAll(".dr-pill-btn")) {
    const label = (pill.getAttribute("aria-label") ?? "").split(": ").slice(1).join(": ");
    const state = PILL_STATE_BY_LABEL[label];
    if (state) tag(pill, "nominee-pill", state);
  }

  tagAll(root, ".drh-tab", (el) => `header-tab:${el.getAttribute("data-tone")}`);
  for (const el of root.querySelectorAll(".dr-rosterCard")) tag(el, "roster-card");

  const menu = root.querySelector(`[${CELL_HOOK_ATTR}='menu'] .mantine-Menu-dropdown`);
  if (menu) {
    tag(menu, "menu");
    const items = menu.querySelectorAll(".mantine-Menu-item");
    items.forEach((item, i) => {
      // The specimen's menu ends with its one destructive item.
      const danger = i === items.length - 1;
      const forced = item.classList.contains("fo-force-hover");
      tag(item, danger ? "menu-item:danger" : "menu-item", forced ? "hover" : "default");
    });
  }

  for (const root_ of root.querySelectorAll(
    `[${CELL_HOOK_ATTR}='segmented'] .mantine-SegmentedControl-root`
  )) {
    tag(root_, "segmented:control");
    for (const label of root_.querySelectorAll(".mantine-SegmentedControl-label")) {
      const input = label.parentElement?.querySelector("input");
      const state = input?.classList.contains("fo-force-focus")
        ? "focus"
        : label.hasAttribute("data-active")
          ? "selected"
          : "default";
      tag(label, "segmented:item", state);
    }
  }

  const alerts = root.querySelectorAll(
    `[${CELL_HOOK_ATTR}='banners'] .mantine-Alert-root`
  );
  for (const [i, alert] of [...alerts].entries()) {
    tag(alert, `banner:${BANNER_VARIANTS[i] ?? "extra"}`);
  }

  for (const [selector, hook] of [
    ["h2", "markdown:h2"],
    ["h3", "markdown:h3"],
    ["h4", "markdown:h4"],
    ["p", "markdown:paragraph"],
    ["ul", "markdown:list"],
    ["a", "markdown:link"]
  ] as const) {
    const el = root.querySelector(`[${CELL_HOOK_ATTR}='markdown'] ${selector}`);
    if (el) tag(el, hook);
  }
}

/** Order the specimen renders its banners in. */
export const BANNER_VARIANTS = ["info", "warning", "success", "error"] as const;
