import type { RAW_TOKEN_NAMES, TOKEN_NAMES } from "./measure";

/**
 * The tolerance spec: one declarative table of what each representative component must
 * measure, in every brand, mode and viewport.
 *
 * How it reads the specimen (`/__specimen`):
 *   - `data-spec="<component>[:<variant>]"` names a component and `data-spec-state` the
 *     state that sample is in (`default` when absent). `data-specimen` is taken by the
 *     page marker, hence the different name. Hooks are stamped by
 *     apps/web/src/features/specimen/hooks.ts on the real components.
 *   - Bounds are written against the brand contract (apps/web/src/theme/brands/contract.ts)
 *     and resolved per brand at run time from the page's own CSS custom properties, so a
 *     new brand inside the contract passes without editing this file. A bound that is not
 *     taken from a contract slot carries a `source` that says where it comes from: the
 *     spread across the current brands, a WCAG threshold, or a prescription section.
 *
 * Nothing here knows about a particular brand. A finding that cannot be fixed in this
 * change goes in allowlist.ts, one entry each, with a follow-up.
 */

export type Viewport = "desktop" | "mobile";
export type State =
  | "default"
  | "hover"
  | "focus"
  | "active"
  | "disabled"
  | "selected"
  | "error"
  | "hover-match"
  | "won"
  | "won-hover"
  | "won-selected"
  | "not-draftable";
export type TokenName = (typeof TOKEN_NAMES)[number] | (typeof RAW_TOKEN_NAMES)[number];
export type FontSlot =
  | "display"
  | "body"
  | "numeral"
  | "label"
  | "nav"
  | "wordmark"
  | "room-work"
  | "room-title";

/** A number, or a contract slot resolved to px at run time (optionally scaled and shifted). */
export type Num = number | { token: TokenName; factor?: number; offset?: number };

/** Numeric properties the runner derives from a sample. */
export type NumProp =
  | "height"
  | "width"
  | "touch"
  | "borderWidth"
  | "radius"
  | "fontSize"
  | "lineHeightRatio"
  | "fontWeight"
  | "letterSpacingEm"
  | "iconSize"
  | "gap";

export type PadValue = Num | { ofHeight: number; offset?: number };

export type Bound =
  | { min?: Num; max?: Num }
  /**
   * Equal to a value within `tol`. `capHalfHeight` and `capPx` model the slots a
   * component clamps (a pill's radius cannot exceed half its height).
   */
  | { equals: Num; tol?: number; capHalfHeight?: boolean; capPx?: number }
  | { anyOf: Num[] };

export type Check =
  | {
      kind: "value";
      prop: NumProp;
      bound: Bound;
      source: string;
      viewports?: Viewport[];
      states?: State[];
    }
  /** Padding on every side is a member of the spacing scale (every `--fo-space-*`). */
  | { kind: "scale"; source: string; viewports?: Viewport[] }
  /**
   * Padding bound to the value its component takes from the library or the prescription,
   * side by side (an omitted side is not checked). `ofHeight` is a fraction of the
   * element's own height (Mantine insets an input's text by a third of its height).
   */
  | {
      kind: "padding";
      top?: PadValue;
      right?: PadValue;
      bottom?: PadValue;
      left?: PadValue;
      tol?: number;
      source: string;
      viewports?: Viewport[];
    }
  /** The face painted for the text is the first family of one of these brand slots. */
  | { kind: "font"; slots: FontSlot[]; source: string }
  | { kind: "case"; token: TokenName; source: string }
  /** Text contrast >= 4.5:1 (3:1 for large text), from the computed colours; disabled is exempt. */
  | { kind: "textContrast" }
  /** The icon glyph stands out from its surface at 3:1 (WCAG 1.4.11 graphical objects); disabled is exempt. */
  | { kind: "iconContrast" }
  /** The control's border or fill stands out from its surface at 3:1 (WCAG 1.4.11); disabled is exempt. */
  | { kind: "boundary"; source: string }
  /** The focus state has an indicator of >= 2 px at >= 3:1 against the surface. */
  | { kind: "focusRing" }
  /** Each listed state renders differently from default in at least one visual property. */
  | { kind: "stateDifference"; states: State[]; own?: true };

export type Entry = {
  hook: string;
  /** States that must be on the specimen. A missing one fails: the specimen drifted from this spec. */
  states: State[];
  /** Hooks that only exist at some widths (the inline nav is a drawer on a phone). */
  viewports?: Viewport[];
  checks: Check[];
};

const TOUCH = { token: "--fo-touch-target" } as const;
const CONTROL = { token: "--fo-control-height" } as const;
const FONT_XS = { token: "--fo-font-size-xs" } as const;
const FONT_MD = { token: "--fo-font-size-md" } as const;

const value = (
  prop: NumProp,
  bound: Bound,
  source: string,
  scope: { viewports?: Viewport[]; states?: State[] } = {}
): Check => ({ kind: "value", prop, bound, source, ...scope });

/** A control (button, input, select): 32 px floor from the contract, 44 px on a phone. */
const controlHeight = (): Check[] => [
  value(
    "height",
    { min: CONTROL, max: { token: "--fo-control-height", offset: 12 } },
    "contract --fo-control-height floor; ceiling is spread-derived (every brand renders 36 px)",
    { viewports: ["desktop"] }
  ),
  value(
    "height",
    { min: TOUCH, max: { token: "--fo-touch-target", offset: 8 } },
    "contract --fo-touch-target floor; ceiling is spread-derived (every brand renders 44 px)",
    { viewports: ["mobile"] }
  ),
  value("touch", { min: TOUCH }, "contract --fo-touch-target (WCAG 2.5.5 / app rule)", {
    viewports: ["mobile"]
  })
];

const FOCUS_STATES: State[] = ["default", "hover", "focus", "active", "disabled"];

const buttonVariant = (variant: string, outlined: boolean): Entry => ({
  hook: `button:${variant}`,
  states: FOCUS_STATES,
  checks: [
    ...controlHeight(),
    value(
      "radius",
      { equals: { token: "--brand-button-radius" } },
      "contract --brand-button-radius"
    ),
    value(
      "borderWidth",
      outlined ? { equals: { token: "--brand-border-width" } } : { equals: 0 },
      outlined
        ? "contract --brand-border-width"
        : "ghost has no border in rest, hover, focus or active",
      { states: ["default", "hover", "focus", "active"] }
    ),
    value(
      "fontSize",
      { min: FONT_XS, max: FONT_MD },
      "contract --fo-font-size-xs..md; spread: 14 px everywhere"
    ),
    value("lineHeightRatio", { min: 1, max: 1.6 }, "single-line control; spread: 1.0"),
    value(
      "fontWeight",
      { min: 500, max: 800 },
      "spread: 600 everywhere; label stays heavier than body"
    ),
    value("letterSpacingEm", { min: -0.02, max: 0.12 }, "spread: 0 everywhere"),
    {
      kind: "padding",
      top: 0,
      bottom: 0,
      left: 18,
      right: 18,
      source:
        "Mantine size sm Button padding (1.125rem), kept by prescription 03 ('padding unchanged'); the button is sized by height, not block padding"
    },
    {
      kind: "font",
      slots: ["body", "label"],
      source: "button label is body or label face"
    },
    { kind: "textContrast" },
    ...(outlined
      ? ([{ kind: "boundary", source: "WCAG 1.4.11 UI boundary" }] satisfies Check[])
      : []),
    { kind: "focusRing" },
    { kind: "stateDifference", states: ["hover", "focus", "disabled"] }
  ]
});

/** Mantine insets a field's text by a third of its height; a trailing section adds its width. */
const fieldPadding = (right: PadValue, source: string): Check => ({
  kind: "padding",
  top: 0,
  bottom: 0,
  left: { ofHeight: 1 / 3 },
  right,
  source: `Mantine input padding: a third of the control height on the text side; ${source}`
});

const field = (hook: string, trailing: Check): Entry => ({
  hook,
  states: ["default", "focus", "error", "disabled"],
  checks: [
    ...controlHeight(),
    value(
      "radius",
      { equals: { token: "--brand-radius-sm" } },
      "contract --brand-radius-sm"
    ),
    value(
      "borderWidth",
      { equals: { token: "--brand-border-width" } },
      "contract --brand-border-width",
      { states: ["default", "error", "disabled"] }
    ),
    value(
      "fontSize",
      { min: FONT_XS, max: FONT_MD },
      "contract --fo-font-size-xs..md; spread: 14 px"
    ),
    value("fontWeight", { min: 400, max: 500 }, "field text is regular; spread: 400"),
    value("letterSpacingEm", { min: -0.02, max: 0.12 }, "spread: 0 everywhere"),
    trailing,
    { kind: "font", slots: ["body"], source: "contract --brand-font-body" },
    { kind: "boundary", source: "WCAG 1.4.11 UI boundary" },
    { kind: "focusRing" },
    { kind: "stateDifference", states: ["focus", "disabled"] }
  ]
});

const chip = (tone: string, iconOnlyLabel = false): Entry => ({
  hook: `chip:${tone}`,
  states: ["default"],
  checks: [
    value(
      "height",
      { min: 18, max: 28 },
      "spread: 22 px in every brand; 18..28 keeps a chip a chip"
    ),
    value(
      "radius",
      { equals: { token: "--brand-radius-sm" } },
      "contract --brand-radius-sm"
    ),
    value(
      "borderWidth",
      { equals: { token: "--brand-border-width" } },
      "contract --brand-border-width"
    ),
    value("gap", { equals: 6 }, "spread: 6 px between mark and label"),
    value("fontWeight", { min: 500, max: 800 }, "spread: 600"),
    ...(iconOnlyLabel
      ? []
      : ([
          value(
            "letterSpacingEm",
            { equals: { token: "--brand-label-letter-spacing" }, tol: 0.005 },
            "contract --brand-label-letter-spacing"
          ),
          {
            kind: "case",
            token: "--brand-label-case",
            source: "contract --brand-label-case"
          },
          { kind: "font", slots: ["label"], source: "contract --brand-font-label" }
        ] satisfies Check[])),
    { kind: "scale", source: "spacing scale (--fo-space-*)" },
    // Not a UI boundary check: a chip is a text label, its words carry the meaning and
    // text contrast covers them (WCAG 1.4.11 asks for control and graphic boundaries).
    { kind: "textContrast" }
  ]
});

const card = (
  variant: string,
  radius: TokenName,
  extra: Check[] = [],
  scope: { states?: State[] } = {}
): Entry => ({
  hook: `card:${variant}`,
  states: scope.states ?? ["default"],
  checks: [
    value("radius", { equals: { token: radius } }, `contract ${radius}`),
    value(
      "width",
      { min: 200 },
      "a card holds a title and a line of body at both widths"
    ),
    { kind: "scale", source: "spacing scale (--fo-space-*)" },
    { kind: "textContrast" },
    ...extra
  ]
});

const banner = (variant: string): Entry => ({
  hook: `banner:${variant}`,
  states: ["default"],
  checks: [
    value(
      "radius",
      { equals: { token: "--brand-radius-sm" } },
      "contract --brand-radius-sm"
    ),
    value(
      "iconSize",
      { min: 16, max: 24 },
      "spread: 18 px; the glyph is the severity cue beside the words"
    ),
    { kind: "scale", source: "spacing scale (--fo-space-*)" },
    { kind: "font", slots: ["body"], source: "contract --brand-font-body" },
    { kind: "textContrast" }
  ]
});

const headerTab = (tone: string): Entry => ({
  hook: `header-tab:${tone}`,
  states: ["default"],
  checks: [
    value(
      "height",
      { min: 48, max: 64 },
      "spread: 54..56 px (--fo-db-tabHeight 54 px plus the tone's edge)"
    ),
    value("width", { min: 200 }, "the tab holds round, headline and pick at 390 px"),
    {
      kind: "font",
      slots: ["room-work", "room-title", "numeral"],
      source: "contract room slots"
    },
    { kind: "textContrast" }
  ]
});

const NOMINEE_STATES: State[] = [
  "default",
  "hover-match",
  "hover",
  "selected",
  "won",
  "won-hover",
  "won-selected",
  "focus",
  "disabled",
  "not-draftable"
];

export const ENTRIES: Entry[] = [
  buttonVariant("primary", true),
  buttonVariant("secondary", true),
  buttonVariant("ghost", false),
  buttonVariant("danger", true),
  {
    hook: "icon-button",
    states: FOCUS_STATES,
    checks: [
      value(
        "height",
        { min: CONTROL, max: { token: "--fo-control-height", offset: 12 } },
        "contract --fo-control-height floor; spread: 32 px",
        { viewports: ["desktop"] }
      ),
      value("height", { min: TOUCH }, "contract --fo-touch-target", {
        viewports: ["mobile"]
      }),
      value("touch", { min: TOUCH }, "contract --fo-touch-target", {
        viewports: ["mobile"]
      }),
      value(
        "radius",
        { equals: { token: "--brand-radius-sm" } },
        "contract --brand-radius-sm"
      ),
      value("iconSize", { min: 16, max: 24 }, "spread: 18 px"),
      { kind: "iconContrast" },
      { kind: "focusRing" },
      { kind: "stateDifference", states: ["hover", "focus", "disabled"] }
    ]
  },
  field("input", fieldPadding({ ofHeight: 1 / 3 }, "no trailing section")),
  field(
    "select",
    fieldPadding(
      { ofHeight: 1, offset: -2 },
      "the chevron section is the height less 2 px"
    )
  ),
  field(
    "number-input",
    fieldPadding(24, "the stepper section is 24 px (Mantine NumberInput size sm)")
  ),
  {
    hook: "checkbox",
    states: ["default", "selected", "focus", "error", "disabled"],
    checks: [
      value("width", { min: 16, max: 24 }, "spread: 20 px box"),
      value("height", { min: 16, max: 24 }, "spread: 20 px box"),
      value(
        "radius",
        { equals: { token: "--brand-radius-sm" }, capPx: 4 },
        "contract --brand-radius-sm, capped at 4 px by the skin"
      ),
      value(
        "touch",
        { min: TOUCH },
        "contract --fo-touch-target: the row is the target",
        {
          viewports: ["mobile"]
        }
      ),
      { kind: "boundary", source: "WCAG 1.4.11 UI boundary" },
      { kind: "focusRing" },
      { kind: "stateDifference", states: ["selected", "focus", "disabled"] }
    ]
  },
  {
    hook: "switch",
    states: ["default", "selected", "focus", "disabled"],
    checks: [
      value("width", { min: 32, max: 56 }, "spread: 38 px track"),
      value("height", { min: 16, max: 28 }, "spread: 20 px track"),
      value(
        "radius",
        { min: 10 },
        "a switch track is a pill: radius at least half its height"
      ),
      value(
        "touch",
        { min: TOUCH },
        "contract --fo-touch-target: the row is the target",
        {
          viewports: ["mobile"]
        }
      ),
      { kind: "boundary", source: "WCAG 1.4.11 UI boundary" },
      { kind: "focusRing" },
      { kind: "stateDifference", states: ["selected", "focus", "disabled"] }
    ]
  },
  {
    hook: "segmented:control",
    states: ["default"],
    checks: [
      value(
        "radius",
        { anyOf: [{ token: "--brand-button-radius" }, { token: "--brand-radius-sm" }] },
        "contract --brand-button-radius, or --brand-radius-sm when stacked (vertical segments)"
      ),
      { kind: "scale", source: "spacing scale (--fo-space-*)" }
    ]
  },
  {
    hook: "segmented:item",
    states: ["default", "selected", "focus"],
    checks: [
      value("touch", { min: TOUCH }, "contract --fo-touch-target", {
        viewports: ["mobile"]
      }),
      value(
        "fontSize",
        { min: FONT_XS, max: FONT_MD },
        "contract --fo-font-size-xs..md; spread: 14 px"
      ),
      value(
        "fontWeight",
        { min: 500, max: 800 },
        "selected 600, idle 500 in every brand"
      ),
      { kind: "font", slots: ["body", "label"], source: "body or label face" },
      { kind: "textContrast" },
      { kind: "focusRing" },
      { kind: "stateDifference", states: ["selected", "focus"] }
    ]
  },
  {
    hook: "menu",
    states: ["default"],
    checks: [
      value(
        "radius",
        { equals: { token: "--brand-radius-sm" } },
        "contract --brand-radius-sm"
      ),
      value("width", { min: 100 }, "spread: 125..132 px"),
      { kind: "scale", source: "spacing scale (--fo-space-*)" },
      { kind: "font", slots: ["body", "label"], source: "body or label face" },
      { kind: "textContrast" }
    ]
  },
  ...(["menu-item", "menu-item:danger"] as const).map((hook): Entry => ({
    hook,
    states: hook === "menu-item" ? ["default", "hover"] : ["default"],
    checks: [
      value(
        "height",
        { equals: { token: "--fo-menu-item-height" } },
        "contract --fo-menu-item-height",
        { viewports: ["desktop"] }
      ),
      value("height", { min: TOUCH }, "contract --fo-touch-target", {
        viewports: ["mobile"]
      }),
      value(
        "radius",
        { equals: { token: "--brand-radius-sm" } },
        "contract --brand-radius-sm"
      ),
      value(
        "fontSize",
        { min: FONT_XS, max: FONT_MD },
        "contract --fo-font-size-xs..md; spread: 14 px"
      ),
      { kind: "scale", source: "spacing scale (--fo-space-*)" },
      { kind: "font", slots: ["body"], source: "contract --brand-font-body" },
      { kind: "textContrast" },
      ...(hook === "menu-item"
        ? ([{ kind: "stateDifference", states: ["hover"] }] satisfies Check[])
        : [])
    ]
  })),
  ...(["active", "idle"] as const).map((kind): Entry => ({
    hook: `nav-item:${kind}`,
    states: kind === "idle" ? ["default", "hover", "focus"] : ["default"],
    viewports: ["desktop"],
    checks: [
      value(
        "fontSize",
        { equals: { token: "--brand-nav-size" } },
        "contract --brand-nav-size"
      ),
      value("fontWeight", { min: 500, max: 800 }, "spread: 600"),
      value(
        "radius",
        {
          anyOf: [0, { token: "--brand-button-radius" }, { token: "--brand-radius-lg" }]
        },
        "underline treatment is square; pill follows the button shape (contract --brand-nav-active)"
      ),
      value("height", { min: 32 }, "spread: 36..49 px; floor is --fo-control-height"),
      { kind: "case", token: "--brand-nav-case", source: "contract --brand-nav-case" },
      { kind: "font", slots: ["nav"], source: "contract --brand-nav-font" },
      { kind: "textContrast" },
      ...(kind === "idle"
        ? ([
            { kind: "focusRing" },
            { kind: "stateDifference", states: ["hover", "focus"] }
          ] satisfies Check[])
        : [])
    ]
  })),
  {
    hook: "account-pill",
    states: ["default"],
    // The phone header keeps the avatar and the drawer button, not the named pill.
    viewports: ["desktop"],
    checks: [
      value(
        "height",
        { equals: { token: "--fo-header-control-size" } },
        "contract --fo-header-control-size"
      ),
      value("iconSize", { min: 16, max: 24 }, "spread: 18 px caret"),
      value("gap", { equals: 8 }, "contract --fo-header-account-gap"),
      {
        kind: "font",
        slots: ["body", "label", "nav"],
        source: "header text uses a working face"
      },
      { kind: "textContrast" }
    ]
  },
  {
    hook: "wordmark",
    states: ["default"],
    checks: [
      value(
        "fontWeight",
        { equals: { token: "--brand-wordmark-weight" } },
        "contract --brand-wordmark-weight"
      ),
      value(
        "letterSpacingEm",
        { equals: { token: "--brand-wordmark-letter-spacing" }, tol: 0.005 },
        "contract --brand-wordmark-letter-spacing"
      ),
      {
        kind: "case",
        token: "--brand-wordmark-case",
        source: "contract --brand-wordmark-case"
      },
      { kind: "font", slots: ["wordmark"], source: "contract --brand-wordmark-font" },
      value("touch", { min: TOUCH }, "contract --fo-touch-target", {
        viewports: ["mobile"]
      }),
      { kind: "textContrast" }
    ]
  },
  card("standard", "--brand-radius-md"),
  // The hero's radius is derived: radius-lg on a panel, 0 for an open or band hero.
  card("hero", "--brand-home-hero-radius", [
    value(
      "fontSize",
      { min: { token: "--brand-h1-size" }, max: { token: "--brand-home-hero-max" } },
      "contract: never below --brand-h1-size, never above the hero's declared maximum"
    ),
    { kind: "font", slots: ["display"], source: "contract --brand-font-display" }
  ]),
  card("action", "--brand-radius-md", [
    { kind: "font", slots: ["display", "body"], source: "title face" }
  ]),
  card("season", "--brand-radius-md"),
  chip("drafting"),
  chip("live"),
  chip("paused", true),
  chip("complete", true),
  chip("neutral"),
  chip("winner", true),
  {
    hook: "nominee-pill",
    states: NOMINEE_STATES,
    checks: [
      value("height", { min: 16, max: 32 }, "spread: 22 px pill row"),
      value(
        "radius",
        { equals: { token: "--brand-radius-sm" }, capHalfHeight: true },
        "contract --brand-radius-sm, clamped to half the pill's height"
      ),
      value(
        "borderWidth",
        { equals: { token: "--brand-border-width" } },
        "contract --brand-border-width"
      ),
      value("fontWeight", { min: 400, max: 700 }, "spread: 500, disabled 400"),
      { kind: "font", slots: ["room-work"], source: "contract room work font" },
      { kind: "textContrast" },
      { kind: "focusRing" },
      {
        kind: "stateDifference",
        states: ["hover", "selected", "won", "focus", "disabled"],
        // Selected and won add a mark inside the pill; only the pill's own paint counts.
        own: true
      }
    ]
  },
  headerTab("rest"),
  headerTab("mine"),
  headerTab("paused"),
  headerTab("countdown-primary"),
  headerTab("countdown-danger"),
  headerTab("final"),
  {
    hook: "roster-card",
    states: ["default"],
    checks: [
      value(
        "radius",
        { equals: { token: "--brand-radius-md" } },
        "contract --brand-radius-md"
      ),
      value(
        "borderWidth",
        { equals: { token: "--brand-border-width" } },
        "contract --brand-border-width"
      ),
      { kind: "scale", source: "spacing scale (--fo-space-*)" },
      { kind: "textContrast" }
    ]
  },
  banner("info"),
  banner("warning"),
  banner("success"),
  banner("error"),
  {
    hook: "empty-state",
    states: ["default"],
    checks: [
      value(
        "radius",
        { equals: { token: "--brand-radius-md" } },
        "contract --brand-radius-md"
      ),
      { kind: "scale", source: "spacing scale (--fo-space-*)" },
      { kind: "font", slots: ["body"], source: "contract --brand-font-body" },
      { kind: "textContrast" }
    ]
  },
  {
    hook: "modal",
    states: ["default"],
    checks: [
      value(
        "radius",
        { equals: { token: "--brand-radius-sm" } },
        "contract --brand-radius-sm"
      ),
      value("width", { min: 240 }, "a modal holds its title and actions at 390 px"),
      { kind: "textContrast" }
    ]
  },
  {
    hook: "toast",
    states: ["default"],
    checks: [
      value(
        "radius",
        { equals: { token: "--brand-radius-sm" } },
        "contract --brand-radius-sm"
      ),
      {
        kind: "padding",
        top: 12,
        right: 12,
        bottom: 12,
        left: 22,
        source:
          "Mantine Notification padding: --fo-space-xs (12 px) on three sides and 22 px on the side that holds the accent bar"
      },
      { kind: "font", slots: ["body"], source: "contract --brand-font-body" },
      { kind: "textContrast" }
    ]
  },
  ...(
    [
      ["markdown:h2", "--brand-h2-size"],
      ["markdown:h3", "--brand-h3-size"],
      ["markdown:h4", "--fo-heading-h4-size"]
    ] as const
  ).map(([hook, size]): Entry => ({
    hook,
    states: ["default"],
    checks: [
      value("fontSize", { equals: { token: size } }, `contract ${size}`),
      { kind: "font", slots: ["display"], source: "contract --brand-font-display" },
      value(
        "fontWeight",
        { min: 500, max: 900 },
        "headings are never lighter than the body"
      ),
      { kind: "textContrast" }
    ]
  })),
  ...(["markdown:paragraph", "markdown:list", "markdown:link"] as const).map(
    (hook): Entry => ({
      hook,
      states: ["default"],
      checks: [
        value(
          "fontSize",
          { min: FONT_XS, max: { token: "--fo-font-size-md", offset: 4 } },
          "contract --fo-font-size-xs..md plus 4 px; spread: 16 px"
        ),
        value(
          "lineHeightRatio",
          { min: 1.2, max: 1.8 },
          "readable body measure; spread: 1.55"
        ),
        { kind: "font", slots: ["body"], source: "contract --brand-font-body" },
        { kind: "textContrast" }
      ]
    })
  )
];

/**
 * Relations between components. These catch regressions a per-component range cannot:
 * one variant drifting while each stays inside its own bounds.
 */
export type Relation =
  /** The property is the same (within `tol`) across these hooks, default state. */
  | {
      kind: "sameWithin";
      hooks: string[];
      prop: NumProp | "paddingX";
      tol: number;
      source: string;
      viewports?: Viewport[];
    }
  /** The property is the same as another hook's. */
  | { kind: "equal"; a: string; b: string; prop: NumProp; tol: number; source: string }
  /**
   * Each hook is larger than the next by at least `minRatio` in font size, or differs in
   * a stated way (`orBy`): weight (by `minWeightStep`) or text case.
   */
  | {
      kind: "ordered";
      hooks: string[];
      minRatio: number;
      orBy?: { prop: "fontWeight" | "textTransform"; minStep?: number };
      source: string;
    };

const BUTTONS = ["button:primary", "button:secondary", "button:ghost", "button:danger"];

export const RELATIONS: Relation[] = [
  {
    kind: "sameWithin",
    hooks: BUTTONS,
    prop: "height",
    tol: 1,
    source: "family consistency: every button variant is the same height"
  },
  {
    kind: "sameWithin",
    hooks: BUTTONS,
    prop: "radius",
    tol: 0,
    source: "family consistency: every button variant shares one shape"
  },
  {
    kind: "sameWithin",
    hooks: BUTTONS,
    prop: "fontSize",
    tol: 0,
    source: "family consistency: every button variant shares one type size"
  },
  ...["input", "select", "number-input"].map((hook): Relation => ({
    kind: "equal",
    a: hook,
    b: "button:primary",
    prop: "height",
    tol: 1,
    source: "a field sits level with the button beside it"
  })),
  {
    kind: "sameWithin",
    hooks: ["input", "select", "number-input"],
    prop: "radius",
    tol: 0,
    source: "family consistency: every field shares one shape"
  },
  {
    kind: "sameWithin",
    hooks: [
      "chip:drafting",
      "chip:live",
      "chip:paused",
      "chip:complete",
      "chip:neutral",
      "chip:winner"
    ],
    prop: "height",
    tol: 1,
    source: "family consistency: every status chip is the same height"
  },
  {
    kind: "sameWithin",
    hooks: [
      "chip:drafting",
      "chip:live",
      "chip:paused",
      "chip:complete",
      "chip:neutral",
      "chip:winner"
    ],
    prop: "paddingX",
    tol: 0,
    source: "family consistency: every status chip pads the same"
  },
  {
    kind: "sameWithin",
    hooks: ["banner:info", "banner:warning", "banner:success", "banner:error"],
    prop: "paddingX",
    tol: 0,
    source: "family consistency: every banner variant pads the same"
  },
  {
    kind: "sameWithin",
    hooks: ["banner:info", "banner:warning", "banner:success", "banner:error"],
    prop: "radius",
    tol: 0,
    source: "family consistency: every banner variant shares one shape"
  },
  {
    kind: "sameWithin",
    hooks: ["card:standard", "card:action", "card:season"],
    prop: "radius",
    tol: 0,
    source: "family consistency: standard, action and season cards share one shape"
  },
  {
    kind: "sameWithin",
    hooks: ["card:standard", "card:action", "card:season"],
    prop: "paddingX",
    tol: 0,
    source: "family consistency: standard, action and season cards pad the same"
  },
  {
    kind: "sameWithin",
    hooks: [
      "header-tab:rest",
      "header-tab:mine",
      "header-tab:paused",
      "header-tab:countdown-primary",
      "header-tab:countdown-danger",
      "header-tab:final"
    ],
    prop: "height",
    tol: 2,
    source:
      "family consistency: the tab keeps its height across tones (an edge may add 2 px)"
  },
  {
    kind: "sameWithin",
    hooks: ["menu-item", "menu-item:danger"],
    prop: "height",
    tol: 0,
    source: "family consistency: every menu item is the same height"
  },
  {
    kind: "ordered",
    hooks: ["markdown:h2", "markdown:h3", "markdown:h4"],
    minRatio: 1.15,
    orBy: { prop: "fontWeight", minStep: 100 },
    source: "type hierarchy: h2 > h3 > h4 by a visible step, or a stated weight step"
  }
];
