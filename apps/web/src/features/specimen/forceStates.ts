/**
 * Forced interaction states for the specimen page.
 *
 * Pseudo-classes (:hover, :focus-visible, :active) cannot be set from script, so the
 * specimen clones every stylesheet rule that uses one, swapping the pseudo-class for a
 * class (`.fo-force-hover`, ...). The clone sits right after the original, so the
 * specimen renders the exact declarations the real state renders, in the same cascade
 * order, with no duplicated CSS to keep in sync.
 */

export type ForcedState = "hover" | "focus" | "active";

const PSEUDO_TO_CLASS: ReadonlyArray<readonly [RegExp, string]> = [
  [/:hover(?![-\w])/g, ".fo-force-hover"],
  [/:focus-visible(?![-\w])/g, ".fo-force-focus"],
  [/:focus-within(?![-\w])/g, ".fo-force-focus-within"],
  [/:focus(?![-\w])/g, ".fo-force-focus"],
  [/:active(?![-\w])/g, ".fo-force-active"]
];

const FORCEABLE = /:(hover|focus-visible|focus-within|focus|active)(?![-\w])/;

type GroupingRule = CSSGroupingRule | CSSStyleSheet;

function forcedSelector(selector: string): string {
  return PSEUDO_TO_CLASS.reduce((out, [from, to]) => out.replace(from, to), selector);
}

function cloneRules(parent: GroupingRule) {
  let rules: CSSRuleList;
  try {
    rules = parent.cssRules;
  } catch {
    // Cross-origin sheets (the icon font stylesheet) are not readable.
    return;
  }
  const clones: Array<{ index: number; css: string }> = [];
  Array.from(rules).forEach((rule, index) => {
    if (rule instanceof CSSStyleRule) {
      if (!FORCEABLE.test(rule.selectorText)) return;
      clones.push({
        index,
        css: `${forcedSelector(rule.selectorText)} { ${rule.style.cssText} }`
      });
    } else if ("cssRules" in rule) {
      cloneRules(rule as CSSGroupingRule);
    }
  });
  // Insert from the end so earlier indexes stay valid.
  for (const { index, css } of clones.reverse()) {
    try {
      parent.insertRule(css, index + 1);
    } catch {
      // A selector the engine cannot parse after rewriting is skipped.
    }
  }
}

let installed = false;

/** Adds the forced-state clones of every readable stylesheet rule. Idempotent. */
export function installForcedStateRules() {
  if (installed) return;
  installed = true;
  for (const sheet of Array.from(document.styleSheets)) cloneRules(sheet);
}

/**
 * Marks `el` as being in the given states. Hover and focus-within also apply to its
 * ancestors up to `boundary`, as they do for real pointer and focus.
 */
export function forceStates(
  el: Element,
  states: readonly ForcedState[],
  boundary: Element
) {
  for (const state of states) {
    el.classList.add(`fo-force-${state}`);
    if (state === "hover" || state === "focus") {
      const ancestorClass =
        state === "hover" ? "fo-force-hover" : "fo-force-focus-within";
      for (let a = el.parentElement; a && a !== boundary; a = a.parentElement) {
        a.classList.add(ancestorClass);
      }
    }
  }
}
