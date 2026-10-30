// The per-brand design contract. Every brand fills every slot below, for both
// colour modes. Values live in one definition file per brand (for example
// refined-gold.ts); everything else in the app reads the generated CSS custom
// properties (see css.ts). Raw colours, fonts and radii are allowed only in
// this folder (enforced by .github/scripts/tokens-check.mjs).
import type { BrandId } from "@fantasy-oscars/shared/brands";

export const MODES = ["light", "dark"] as const;
export type Mode = (typeof MODES)[number];

/** Colour slots, filled per brand and per mode. Values are `#rrggbb` or `rgba(r, g, b, a)`. */
export const COLOR_SLOTS = [
  "page",
  "surface",
  "raised",
  "sunken",
  "text",
  "muted",
  "faint",
  "rule",
  "ruleStrong",
  "primary",
  "onPrimary",
  "accent",
  "link",
  "linkHover",
  "focusRing"
] as const;
export type ColorSlot = (typeof COLOR_SLOTS)[number];
export type ColorSlots = Record<ColorSlot, string>;

/** Shadow slots, filled per brand and per mode. Values are CSS box-shadow lists. */
export const SHADOW_SLOTS = ["card", "raised"] as const;
export type ShadowSlot = (typeof SHADOW_SLOTS)[number];
export type ShadowSlots = Record<ShadowSlot, string>;

export type ModeSlots = { colors: ColorSlots; shadows: ShadowSlots };

export const TEXT_CASES = ["none", "uppercase", "lowercase", "capitalize"] as const;
export type TextCase = (typeof TEXT_CASES)[number];

export const TWO_TONE_METHODS = ["colour", "italic", "weight"] as const;
export type TwoToneMethod = (typeof TWO_TONE_METHODS)[number];

export const BUTTON_SHAPES = ["pill", "rounded", "square"] as const;
export type ButtonShape = (typeof BUTTON_SHAPES)[number];

export const RULE_STYLES = ["solid", "double"] as const;
export type RuleStyle = (typeof RULE_STYLES)[number];

export const NAV_TREATMENTS = ["pill", "underline"] as const;
export type NavTreatment = (typeof NAV_TREATMENTS)[number];

/** Closed list of decorations; each is a plain on/off switch. */
export const DECORATIONS = [
  "doubleRules",
  "offsetShadow",
  "frameBorders",
  "greasePencil"
] as const;
export type Decoration = (typeof DECORATIONS)[number];

export type TypeSlots = {
  displayFont: string;
  bodyFont: string;
  numeralFont: string;
  labelFont: string;
  labelCase: TextCase;
  labelLetterSpacing: string;
  h1Size: string;
  h2Size: string;
  h3Size: string;
  bodySize: string;
};

export type WordmarkSlots = {
  font: string;
  weight: string;
  case: TextCase;
  letterSpacing: string;
  twoTone: TwoToneMethod;
};

export type ShapeSlots = {
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  buttonShape: ButtonShape;
  borderWidth: string;
  ruleStyle: RuleStyle;
};

export type NavigationSlots = {
  activeTab: NavTreatment;
  font: string;
  case: TextCase;
  size: string;
};

export type BrandDefinition = {
  id: BrandId;
  /** Colours and shadows, one set per mode. */
  modes: Record<Mode, ModeSlots>;
  type: TypeSlots;
  wordmark: WordmarkSlots;
  shape: ShapeSlots;
  navigation: NavigationSlots;
  decorations: Record<Decoration, boolean>;
  /** Which of the seven home layouts this brand uses. */
  homeLayout: BrandId;
};
