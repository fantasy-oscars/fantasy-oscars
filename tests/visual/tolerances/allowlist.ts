import type { FailureKey } from "./judge";

/**
 * Findings the tolerance tier reports on today's look that are not fixed in the change
 * that introduced the tier. One entry per finding: the component, property, the exact
 * measured value pinned per brand, a reason and the named follow-up that removes it. No
 * wildcards: a brand, mode, viewport or value is listed or it is not covered, so a
 * different value (a mutation, a further regression) still fails. An entry that no longer matches any finding
 * fails the run (see results.ts), so the fix and the deletion land together. Do not add
 * an entry for a failure a change introduced; fix the change.
 */
export type ToleranceAllowance = {
  /**
   * The measured value(s) this entry tolerates, per brand, as the failure message prints
   * them (a number, or `border|fill` for a boundary, `big/small` for a type step). A
   * brand not listed, or a value not listed for it, is not covered.
   */
  pins: Readonly<Record<string, readonly string[]>>;
  modes: readonly ("light" | "dark")[];
  viewports: readonly ("desktop" | "mobile")[];
  hook: string;
  /** Omit to cover every state of the hook that shows the finding. */
  states?: readonly string[];
  /** A value property, a check kind (`boundary`, `touch`, ...), `relation:<prop>`, `axe`. */
  prop: string;
  reason: string;
  /** The named piece of work that removes the finding. */
  followUp: string;
  /** ISO date the entry was recorded. */
  date: string;
};

const BOTH_MODES = ["light", "dark"] as const;
const BOTH_VIEWPORTS = ["desktop", "mobile"] as const;
const DATE = "2026-11-15";

const PINS_BTN: ToleranceAllowance["pins"] = {
  festival: ["1.42|2.14", "1.42|2.54", "1.69|3"],
  technicolor: ["1.45|2.3", "1.45|2.75"]
};

const PINS_CB: ToleranceAllowance["pins"] = {
  ballot: ["1.36|1.07", "1.54|1.08"],
  default: ["1.27|1.06", "1.46|1.09"],
  festival: ["1.37|1.09", "1.52|1.09"],
  lightbox: ["1.33|1.18", "1.67|1.08"],
  noir: ["1.45|1.09", "1.4|1.1"],
  "red-carpet": ["1.3|1.13", "1.44|1.06"],
  technicolor: ["1.35|1.06", "1.56|1.09"]
};

const PINS_CBT: ToleranceAllowance["pins"] = {
  ballot: ["20", "40.39"],
  default: ["20", "40.39"],
  festival: ["20", "40.39"],
  lightbox: ["20", "40.39"],
  noir: ["20", "40.39"],
  "red-carpet": ["20", "40.39"],
  technicolor: ["20", "40.39"]
};

const PINS_SW: ToleranceAllowance["pins"] = {
  ballot: ["20"],
  default: ["20"],
  festival: ["20"],
  lightbox: ["20"],
  noir: ["20"],
  "red-carpet": ["20"],
  technicolor: ["20"]
};

export const TOLERANCE_ALLOWLIST: readonly ToleranceAllowance[] = [
  {
    pins: PINS_BTN,
    modes: ["dark"],
    viewports: BOTH_VIEWPORTS,
    hook: "button:primary",
    states: ["default", "hover", "focus", "active"],
    prop: "boundary",
    reason:
      "The primary fill sits at about 3.0:1 against the dark page and its 1 px border at 1.4 to 1.7:1, so the button edge falls just under WCAG 1.4.11. The label itself passes text contrast.",
    followUp:
      "dark-primary-fill: lift the dark primary slot of festival and technicolor by one step",
    date: DATE
  },
  {
    pins: PINS_CB,
    modes: BOTH_MODES,
    viewports: BOTH_VIEWPORTS,
    hook: "checkbox",
    states: ["selected"],
    prop: "boundary",
    reason:
      "A checked box drops to the faint rule colour for its border and a pale fill (1.3 to 1.7:1 and 1.1 to 1.2:1), weaker than the unchecked box (3.4:1); only the check mark carries the state.",
    followUp:
      "checkbox-selected-state: keep the strong border (or a solid fill) when checked",
    date: DATE
  },
  {
    pins: PINS_CBT,
    modes: BOTH_MODES,
    viewports: ["mobile"],
    hook: "checkbox",
    states: ["default", "selected", "focus", "error", "disabled"],
    prop: "touch",
    reason:
      "The tap area is the 20 to 40 px label row, as the assertion tier already allowlists for Checkbox-input; the box itself is a visual mark.",
    followUp:
      "form-row-touch-targets: give checkbox and switch rows a 44 px minimum on a phone",
    date: DATE
  },
  {
    pins: PINS_SW,
    modes: BOTH_MODES,
    viewports: ["mobile"],
    hook: "switch",
    states: ["default", "selected", "focus", "disabled"],
    prop: "touch",
    reason: "The switch row is 20 px high on a phone, under the 44 px target.",
    followUp:
      "form-row-touch-targets: give checkbox and switch rows a 44 px minimum on a phone",
    date: DATE
  }
];

export function allowanceMatches(a: ToleranceAllowance, key: FailureKey): boolean {
  return (
    (a.pins[key.brand]?.includes(key.value) ?? false) &&
    a.modes.includes(key.mode as "light" | "dark") &&
    a.viewports.includes(key.viewport) &&
    a.hook === key.hook &&
    (!a.states || a.states.includes(key.state)) &&
    a.prop === key.prop
  );
}
