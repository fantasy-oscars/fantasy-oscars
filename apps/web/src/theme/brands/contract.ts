// The per-brand design contract. Every brand fills every slot below, for both
// colour modes. Values live in one definition file per brand (for example
// refined-gold.ts); everything else in the app reads the generated CSS custom
// properties (see css.ts). Raw colours, fonts and radii are allowed only in
// this folder (enforced by .github/scripts/tokens-check.mjs).
import type { BrandId } from "@fantasy-oscars/shared/brands";
import type { FontSlots } from "./fontCatalog";

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
export const SHADOW_SLOTS = ["card", "raised", "overlay", "hero"] as const;
export type ShadowSlot = (typeof SHADOW_SLOTS)[number];
export type ShadowSlots = Record<ShadowSlot, string>;

export type ModeSlots = { colors: ColorSlots; shadows: ShadowSlots };

export const TEXT_CASES = ["none", "uppercase", "lowercase", "capitalize"] as const;
export type TextCase = (typeof TEXT_CASES)[number];

/** How the second word of the wordmark differs: `stop` keeps both words alike and adds a trailing full stop. */
export const TWO_TONE_METHODS = ["colour", "italic", "weight", "stop"] as const;
export type TwoToneMethod = (typeof TWO_TONE_METHODS)[number];

/** Colours the active nav indicator may take; `gold` is the shared win-gold text colour. */
export const NAV_ACTIVE_COLORS = ["primary", "accent", "text", "gold"] as const;
export type NavActiveColor = (typeof NAV_ACTIVE_COLORS)[number];

/** Colours the wordmark's second word (or full stop) may take. */
export const WORDMARK_TONE_COLORS = ["primary", "accent", "gold"] as const;
export type WordmarkToneColor = (typeof WORDMARK_TONE_COLORS)[number];

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

export const ACCENT_STYLES = ["normal", "italic"] as const;
export type AccentStyle = (typeof ACCENT_STYLES)[number];

/** `column`: the Home hero tops the reading column. `masthead`: it spans both columns. */
export const HOME_PLACEMENTS = ["column", "masthead"] as const;
export type HomePlacement = (typeof HOME_PLACEMENTS)[number];

/**
 * `darkPanel`: the dark-mode surface in both modes. `accentPanel`: the light-mode
 * accent in both modes. `open`: type on the page with a rule under it.
 */
export const HERO_SURFACES = ["darkPanel", "accentPanel", "open"] as const;
export type HeroSurface = (typeof HERO_SURFACES)[number];

export const HERO_ALIGNS = ["start", "center"] as const;
export type HeroAlign = (typeof HERO_ALIGNS)[number];

/** `cards`: the Home update is a card. `open`: it sits on the page, with a rule beside the side column. */
export const HOME_REGIONS = ["cards", "open"] as const;
export type HomeRegions = (typeof HOME_REGIONS)[number];

/** `primary`: the create-league card is filled with the primary colour. */
export const CTA_SURFACES = ["card", "primary"] as const;
export type CtaSurface = (typeof CTA_SURFACES)[number];

/** Bounds of `heroFit`, a percentage of the hero's inner width. */
export const HERO_FIT_RANGE = { min: 8, max: 30 } as const;

export type TypeSlots = {
  displayFont: string;
  bodyFont: string;
  numeralFont: string;
  labelFont: string;
  labelCase: TextCase;
  labelLetterSpacing: string;
  /** Font weight of titles and the hero title (`--brand-display-weight`). */
  displayWeight: string;
  /** Text case of titles (`--brand-display-case`); the draft room overrides it to none. */
  displayCase: TextCase;
  /** Letter-spacing of display titles (`--brand-display-tracking`); each display face needs its own. */
  displayTracking: string;
  /** Letter-spacing of the page hero title (`--brand-hero-tracking`); large sizes can want a different value than card titles. */
  heroTracking: string;
  /** Word-spacing of display titles (`--brand-display-word-spacing`); faces with a narrow space glyph need more. */
  displayWordSpacing: string;
  h1Size: string;
  h2Size: string;
  h3Size: string;
  bodySize: string;
  /** Font of the Home hero tagline (`--brand-font-accent`). */
  accentFont: string;
  /** Style of the Home hero tagline (`--brand-accent-style`). */
  accentStyle: AccentStyle;
};

/** Composition of Home. Components read the derived `--brand-home-*` properties, never these enums. */
export type HomeSlots = {
  placement: HomePlacement;
  heroSurface: HeroSurface;
  heroAlign: HeroAlign;
  /** Largest hero title size on desktop, in px. */
  heroMax: string;
  /** Hero title size as a percentage of the hero's inner width; the smaller of this and `heroMax` wins. */
  heroFit: number;
  regions: HomeRegions;
  ctaSurface: CtaSurface;
};

export type WordmarkSlots = {
  font: string;
  weight: string;
  case: TextCase;
  letterSpacing: string;
  twoTone: TwoToneMethod;
  /** Colour of the second word (`colour`) or of the full stop (`stop`); still required when unused. */
  toneColor: WordmarkToneColor;
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
  /** Colour of the active underline, or the fill of the active pill (must be text, primary or accent for pills). */
  activeColor: NavActiveColor;
  font: string;
  case: TextCase;
  size: string;
};

export const ROOM_RING_WIDTHS = [0, 1, 2, 3] as const;
export const ROOM_RING_COLORS = ["rule", "ruleStrong", "text"] as const;
export const ROOM_DEPTHS = ["none", "soft", "glow"] as const;
export const ROOM_DROP_RANGE = { min: 0, max: 6 } as const;
export const ROOM_TITLE_FACES = ["work", "label", "display"] as const;
export const ROOM_TAB_EDGES = [
  "flat",
  "keyline",
  "double",
  "ring",
  "drop",
  "lift"
] as const;

/** Composition of the draft room. Components read the derived `--brand-room-*` properties, never these enums. */
export type RoomSlots = {
  /** Font of pills, rail rows, numbers and every label in the room. Family must be in ROOM_WORK_FONTS. */
  workFont: string;
  /** Voice of rail titles and the header tab's fixed status words. */
  titleFace: (typeof ROOM_TITLE_FACES)[number];
  edge: {
    ring: (typeof ROOM_RING_WIDTHS)[number];
    ringColor: (typeof ROOM_RING_COLORS)[number];
    /** Hard downward offset in px; 0 unless ring is at least 1. */
    drop: number;
    depth: (typeof ROOM_DEPTHS)[number];
  };
  /** Edge of the header tab. `ring` and `drop` take their width and colour from `edge`. */
  tabEdge: (typeof ROOM_TAB_EDGES)[number];
};

export type BrandDefinition = {
  id: BrandId;
  /** Colours and shadows, one set per mode. */
  modes: Record<Mode, ModeSlots>;
  type: TypeSlots;
  /** Font files this brand needs; see fontCatalog.ts. */
  fonts: FontSlots;
  wordmark: WordmarkSlots;
  shape: ShapeSlots;
  navigation: NavigationSlots;
  decorations: Record<Decoration, boolean>;
  home: HomeSlots;
  room: RoomSlots;
};
