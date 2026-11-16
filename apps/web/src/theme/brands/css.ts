// Pure generator: brand definitions in, one stylesheet out. Output depends only
// on the inputs (stable order, no timestamps), so it is safe to snapshot.
import {
  COLOR_SLOTS,
  DECORATIONS,
  MODES,
  SHADOW_SLOTS,
  type BrandDefinition,
  type Mode,
  type ColorSlot,
  type NavActiveColor,
  type RoomSlots,
  type WordmarkToneColor
} from "./contract";
import { sharedByMode, sharedConstants } from "./shared";

type Declarations = Array<[name: string, value: string]>;

const LIGHT = '[data-mantine-color-scheme="light"]';
// Dark is the unscoped default, as before brands (Mantine's :root values were dark).
const DARK = `:not(${LIGHT})`;

export function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** `r, g, b` channels of `#rgb`, `#rrggbb` or `rgba(r, g, b, a)`. */
export function colorChannels(value: string): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const h = hex[1]!;
    const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
    const n = (i: number) => parseInt(full.slice(i, i + 2), 16);
    return `${n(0)}, ${n(2)}, ${n(4)}`;
  }
  const rgb =
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/.exec(
      value
    );
  if (rgb) return `${rgb[1]}, ${rgb[2]}, ${rgb[3]}`;
  throw new Error(`Unsupported colour value: ${value}`);
}

function channelValues(value: string): [number, number, number] {
  return colorChannels(value).split(",").map(Number) as [number, number, number];
}

function luminance(value: string): number {
  const [r, g, b] = channelValues(value).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two opaque colours (`#rgb`, `#rrggbb` or `rgba(...)`, alpha ignored). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function buttonRadius(shape: BrandDefinition["shape"]["buttonShape"]): string {
  if (shape === "pill") return "var(--fo-radius-pill)";
  if (shape === "rounded") return "var(--brand-radius-sm)";
  return "0";
}

/** The custom-property value that resolves, per mode, to a contract colour name. */
function colorRef(name: NavActiveColor | WordmarkToneColor): string {
  if (name === "gold") return "var(--fo-win-gold-text)";
  return `var(--brand-${name})`;
}

function navPillForeground(color: NavActiveColor): string {
  // Each of these pairs passes 4.5:1 in every palette (see the brand contract test).
  if (color === "primary") return "var(--brand-on-primary)";
  return "var(--brand-page)";
}

/**
 * Values components read instead of the enum slots, so a component never
 * branches on a brand's choice. `--brand-deco-*` style multipliers stay unitless.
 */
function derivedDeclarations(brand: BrandDefinition): Declarations {
  const { type, wordmark, shape, navigation, decorations } = brand;
  const pill = navigation.activeTab === "pill";
  const indicator = colorRef(navigation.activeColor);
  const sectionRule =
    shape.ruleStyle === "double"
      ? "3px double var(--brand-text)"
      : decorations.frameBorders
        ? "var(--brand-border-width) solid var(--brand-text)"
        : "var(--brand-border-width) solid var(--brand-rule)";
  const tone = wordmark.twoTone;
  const toneColoured = tone === "colour" || tone === "colourItalic";
  return [
    ["--brand-nav-pill", pill ? "1" : "0"],
    ["--brand-nav-indicator", indicator],
    ["--brand-nav-active-bg", pill ? indicator : "transparent"],
    [
      "--brand-nav-active-fg",
      pill ? navPillForeground(navigation.activeColor) : "var(--brand-text)"
    ],
    ["--brand-nav-active-border", pill ? "var(--brand-text)" : indicator],
    ["--brand-nav-border-width", pill ? "var(--brand-border-width)" : "0 0 2px"],
    [
      "--brand-nav-letter-spacing",
      navigation.case === "uppercase" ? type.labelLetterSpacing : "normal"
    ],
    ["--brand-section-rule", sectionRule],
    ["--brand-nav-rule", pill ? "0 solid transparent" : "var(--brand-section-rule)"],
    [
      "--brand-wordmark-tone-color",
      toneColoured ? colorRef(wordmark.toneColor) : "inherit"
    ],
    [
      "--brand-wordmark-tone-style",
      tone === "italic" || tone === "colourItalic" ? "italic" : "normal"
    ],
    [
      "--brand-wordmark-tone-weight",
      tone === "italic" || tone === "weight" ? "400" : "inherit"
    ],
    ["--brand-wordmark-stop-display", tone === "stop" ? "inline" : "none"],
    ["--brand-wordmark-stop-color", colorRef(wordmark.toneColor)]
  ];
}

/** Lowest contrast the wordmark's tone colour may have against the hero surface (display-size text). */
export const HERO_TONE_MIN_CONTRAST = 3;

/**
 * The wordmark's tone colour on the Home hero. An open hero sits on the page, so it
 * takes the header's colour. A panel keeps one colour in both modes, so the tone
 * takes whichever mode's value of its slot reads on that panel at 3:1, the panel's
 * own mode first. When neither does (an accent tone on the accent panel), the second
 * word takes the hero ink and keeps only its style or weight.
 */
export function heroToneColor(brand: BrandDefinition): string {
  const { home, wordmark } = brand;
  if (home.heroSurface === "open") return colorRef(wordmark.toneColor);
  const panel =
    home.heroSurface === "darkPanel"
      ? brand.modes.dark.colors.surface
      : brand.modes.light.colors.accent;
  const order: Mode[] =
    home.heroSurface === "darkPanel" ? ["dark", "light"] : ["light", "dark"];
  const value = (mode: Mode) =>
    wordmark.toneColor === "gold"
      ? sharedByMode[mode]["--fo-win-gold-text"]
      : brand.modes[mode].colors[wordmark.toneColor];
  const mode = order.find(
    (m) => contrastRatio(value(m), panel) >= HERO_TONE_MIN_CONTRAST
  );
  if (!mode) return "inherit";
  return wordmark.toneColor === "gold"
    ? value(mode)
    : `var(--brand-${mode}-${kebab(wordmark.toneColor)})`;
}

/** Lowest contrast the side column's eyebrow heading may have against the page to take `accent`. */
export const ASIDE_EYEBROW_MIN_CONTRAST = 4.5;

/**
 * The Home accent ink on the hero: the shared ceremony gold. On a panel it takes
 * whichever mode's gold reads at 3:1, the panel's own mode first. Null when
 * neither does; the second word then keeps the wordmark's tone.
 */
export function heroAccentColor(brand: BrandDefinition): string | null {
  const { home } = brand;
  if (home.heroSurface === "open") return colorRef("gold");
  const panel =
    home.heroSurface === "darkPanel"
      ? brand.modes.dark.colors.surface
      : brand.modes.light.colors.accent;
  const order: Mode[] =
    home.heroSurface === "darkPanel" ? ["dark", "light"] : ["light", "dark"];
  const gold = order
    .map((m) => sharedByMode[m]["--fo-win-gold-text"])
    .find((value) => contrastRatio(value, panel) >= HERO_TONE_MIN_CONTRAST);
  return gold ?? null;
}

/**
 * Colour of the outermost spread ring (`0 0 0 <n>px <colour>`, not inset) in a
 * box-shadow list, or null when the list has none.
 */
export function shadowRingColor(shadow: string): string | null {
  for (const layer of shadow.split(/,(?![^(]*\))/)) {
    const m =
      /^\s*0(?:px)? 0(?:px)? 0(?:px)? [1-9]\d*px (#[0-9a-f]{3,6}|rgba?\([^)]*\))\s*$/i.exec(
        layer
      );
    if (m) return m[1]!;
  }
  return null;
}

/**
 * The 1 px edge above and below a `band` hero, per mode: the hero shadow's ring
 * colour, or `ruleStrong` when that shadow has no ring.
 */
export function bandEdgeColor(brand: BrandDefinition, mode: Mode): string {
  const { colors, shadows } = brand.modes[mode];
  return shadowRingColor(shadows.hero) ?? colors.ruleStrong;
}

/** Per-mode Home properties, under the active-mode names only. */
function homeModeDeclarations(brand: BrandDefinition, mode: Mode): Declarations {
  const { colors } = brand.modes[mode];
  const accentReads =
    contrastRatio(colors.accent, colors.page) >= ASIDE_EYEBROW_MIN_CONTRAST;
  return [
    ["--brand-home-band-edge", bandEdgeColor(brand, mode)],
    [
      "--brand-home-aside-heading-color",
      brand.home.asideHeading === "eyebrow"
        ? accentReads
          ? "var(--brand-accent)"
          : "var(--brand-muted)"
        : "inherit"
    ]
  ];
}

/** Derived Home properties (see the Home layouts prescription, 3.2). */
function homeDeclarations(brand: BrandDefinition): Declarations {
  const { home, shape, wordmark } = brand;
  const panel = home.heroSurface !== "open";
  const band = home.placement === "band";
  const heroTone = heroToneColor(brand);
  const open = home.regions === "open";
  const primary = home.ctaSurface === "primary";
  const ctaInHero = home.ctaPlacement === "hero";
  const updateRule = home.updateRule === "accent";
  const eyebrow = home.asideHeading === "eyebrow";
  const heroAccent = home.heroTone.color === "accent" ? heroAccentColor(brand) : null;
  const twoTone = wordmark.twoTone;
  const heroWordTone =
    heroAccent ??
    (twoTone === "colour" || twoTone === "colourItalic" ? heroTone : "inherit");
  const heroWordStyle =
    home.heroTone.style === "italic" || twoTone === "italic" || twoTone === "colourItalic"
      ? "italic"
      : "normal";
  const heroBg = {
    darkPanel: "var(--brand-dark-surface)",
    accentPanel: "var(--brand-light-accent)",
    open: "transparent"
  }[home.heroSurface];
  const heroFg = {
    darkPanel: "var(--brand-dark-text)",
    accentPanel: "var(--brand-light-page)",
    open: "var(--brand-text)"
  }[home.heroSurface];
  const heroFgRgb = {
    darkPanel: "var(--brand-dark-text-rgb)",
    accentPanel: "var(--brand-light-page-rgb)",
    open: "var(--brand-text-rgb)"
  }[home.heroSurface];
  const heroMuted = {
    darkPanel: "var(--brand-dark-muted)",
    accentPanel: "rgba(var(--brand-light-page-rgb), 0.9)",
    open: "var(--brand-muted)"
  }[home.heroSurface];
  const openRule =
    shape.ruleStyle === "double"
      ? "3px double var(--brand-text)"
      : "2px solid var(--brand-text)";
  return [
    [
      "--brand-home-areas",
      home.placement === "column"
        ? '"hero aside" "updates aside"'
        : '"hero hero" "updates aside"'
    ],
    ["--brand-home-hero-panel", panel ? "1" : "0"],
    ["--brand-home-hero-band", band ? "1" : "0"],
    [
      "--brand-home-hero-band-fill",
      band
        ? "linear-gradient(var(--brand-home-band-edge) 0 1px, var(--brand-home-hero-bg) 1px calc(100% - 1px), var(--brand-home-band-edge) calc(100% - 1px))"
        : "none"
    ],
    [
      "--brand-home-hero-shadow",
      band ? "0 0 0 0 transparent" : "var(--brand-shadow-hero)"
    ],
    ["--brand-home-hero-bg", heroBg],
    ["--brand-home-hero-fg", heroFg],
    ["--brand-home-hero-fg-rgb", heroFgRgb],
    ["--brand-home-hero-muted", heroMuted],
    ["--brand-home-hero-radius", panel && !band ? "var(--brand-radius-lg)" : "0"],
    ["--brand-home-hero-rule", panel ? "0 solid transparent" : openRule],
    ["--brand-home-hero-align", home.heroAlign],
    ["--brand-home-hero-tagline-inline", home.heroAlign === "center" ? "auto" : "0"],
    ["--brand-home-hero-max", home.heroMax],
    ["--brand-home-hero-fit", String(home.heroFit)],
    ["--brand-home-hero-tone-color", heroWordTone],
    ["--brand-home-hero-tone-style", heroWordStyle],
    ["--brand-home-hero-stop-color", heroTone],
    ["--brand-home-open", open ? "1" : "0"],
    ["--brand-home-updates-bg", open ? "transparent" : "var(--panel)"],
    [
      "--brand-home-updates-shadow",
      open ? "0 0 0 0 transparent" : "var(--brand-shadow-card)"
    ],
    [
      "--brand-home-aside-rule",
      open ? "var(--brand-section-rule)" : "0 solid transparent"
    ],
    ["--brand-home-align", open ? "stretch" : "start"],
    ["--brand-home-cta-bg", primary ? "var(--brand-primary)" : "var(--panel)"],
    ["--brand-home-cta-fg", primary ? "var(--brand-on-primary)" : "var(--brand-text)"],
    [
      "--brand-home-cta-shadow",
      primary ? "0 0 0 0 transparent" : "var(--brand-shadow-card)"
    ],
    [
      "--brand-home-cta-button-bg",
      primary ? "var(--brand-on-primary)" : "var(--brand-primary)"
    ],
    [
      "--brand-home-cta-button-fg",
      primary ? "var(--brand-primary)" : "var(--brand-on-primary)"
    ],
    [
      "--brand-home-cta-button-hover",
      primary
        ? "color-mix(in srgb, var(--brand-on-primary) 88%, var(--brand-primary))"
        : "var(--fo-button-primary-hover)"
    ],
    [
      "--brand-home-cta-button-active",
      primary
        ? "color-mix(in srgb, var(--brand-on-primary) 80%, var(--brand-primary))"
        : "var(--fo-button-primary-active)"
    ],
    [
      "--brand-home-cta-button-bd",
      primary ? "var(--brand-on-primary)" : "var(--fo-button-primary-border)"
    ],
    [
      "--brand-home-cta-button-bd-hover",
      primary ? "var(--brand-on-primary)" : "var(--fo-button-primary-border-hover)"
    ],
    [
      "--brand-home-cta-ring",
      primary ? "var(--brand-on-primary)" : "var(--brand-focus-ring)"
    ],
    // The create-league card renders in one of two slots; `contents` keeps its own layout.
    ["--brand-home-cta-hero-display", ctaInHero ? "contents" : "none"],
    ["--brand-home-cta-aside-display", ctaInHero ? "none" : "contents"],
    ["--brand-home-cta-hero-edge", heroMuted],
    [
      "--brand-home-update-rule",
      updateRule ? "1px solid var(--fo-win-gold-text)" : "0 solid transparent"
    ],
    ["--brand-home-update-ruled", updateRule ? "1" : "0"],
    [
      "--brand-home-aside-heading-font",
      eyebrow ? "var(--brand-font-label)" : "var(--brand-font-display)"
    ],
    [
      "--brand-home-aside-heading-weight",
      eyebrow ? "var(--fo-font-weight-semibold)" : "var(--brand-display-weight)"
    ],
    [
      "--brand-home-aside-heading-case",
      eyebrow ? "uppercase" : "var(--brand-display-case)"
    ],
    [
      "--brand-home-aside-heading-tracking",
      eyebrow ? "var(--fo-letterSpacing-eyebrow)" : "var(--brand-display-tracking)"
    ],
    [
      "--brand-home-aside-heading-size",
      eyebrow ? "var(--fo-font-size-xs)" : "var(--fo-heading-h3-size)"
    ]
  ];
}

/** Tab tones whose edge colour is resolved per brand and mode. */
export const ROOM_TAB_EDGE_TONES = ["on-primary", "on-danger"] as const;
export type RoomTabEdgeTone = (typeof ROOM_TAB_EDGE_TONES)[number];

/** Lowest contrast a tab edge may have against the tab fill and against the page. */
export const ROOM_TAB_EDGE_MIN_CONTRAST = 3;

/** Resolved card-ring width and drop of the header tab, in px; both 0 unless `tabEdge` is `ring` or `drop`. */
export function roomTabRing(room: RoomSlots): { ring: number; drop: number } {
  if (room.tabEdge !== "ring" && room.tabEdge !== "drop") return { ring: 0, drop: 0 };
  const ring = Math.max(room.edge.ring, 1);
  const drop =
    room.tabEdge === "drop" ? Math.min(Math.max(room.edge.drop, 4), 7 - ring) : 0;
  return { ring, drop };
}

/**
 * The colour slot a tab edge takes on a coloured tab fill: the first of
 * `ringColor`, `text`, `ruleStrong` that reaches 3:1 against both the fill and
 * the page. Returns undefined when none does.
 */
export function pickTabEdge(
  brand: BrandDefinition,
  mode: Mode,
  fill: string
): ColorSlot | undefined {
  const { colors } = brand.modes[mode];
  const candidates: ColorSlot[] = [brand.room.edge.ringColor, "text", "ruleStrong"];
  return candidates.find(
    (slot) =>
      contrastRatio(colors[slot], fill) >= ROOM_TAB_EDGE_MIN_CONTRAST &&
      contrastRatio(colors[slot], colors.page) >= ROOM_TAB_EDGE_MIN_CONTRAST
  );
}

function resolveTabEdge(
  brand: BrandDefinition,
  mode: Mode,
  tone: RoomTabEdgeTone
): ColorSlot {
  const fill =
    tone === "on-primary"
      ? brand.modes[mode].colors.primary
      : sharedConstants["--fo-danger"];
  const picked = pickTabEdge(brand, mode, fill);
  if (picked) return picked;
  // Brands whose tab edge draws no ring never read this value.
  if (brand.room.tabEdge !== "ring" && brand.room.tabEdge !== "drop") {
    return brand.room.edge.ringColor;
  }
  throw new Error(
    `Brand "${brand.id}" (${mode}): no tab edge colour reaches ${ROOM_TAB_EDGE_MIN_CONTRAST}:1 on the ${tone} tab; choose another tabEdge`
  );
}

/** Derived draft-room properties that are the same in both modes (draft room prescription, 3.3). */
function roomDeclarations(brand: BrandDefinition): Declarations {
  const { room, type } = brand;
  const tab = roomTabRing(room);
  const title = {
    work: room.workFont,
    label: type.labelFont,
    display: type.displayFont
  }[room.titleFace];
  const ringColor = `var(--brand-${kebab(room.edge.ringColor)})`;
  return [
    ["--brand-room-font-work", room.workFont],
    ["--brand-room-font-title", title],
    [
      "--brand-room-title-weight",
      room.titleFace === "display" ? type.displayWeight : "600"
    ],
    ["--brand-room-ring", `${room.edge.ring}px`],
    ["--brand-room-ring-color", ringColor],
    ["--brand-room-drop", `${room.edge.drop}px`],
    [
      "--brand-room-card-shadow",
      "0 0 0 var(--brand-room-ring) var(--brand-room-ring-color), 0 var(--brand-room-drop) 0 var(--brand-room-ring) var(--brand-room-ring-color), var(--brand-room-depth)"
    ],
    ["--brand-room-tab-keyline", room.tabEdge === "keyline" ? "1" : "0"],
    ["--brand-room-tab-border", room.tabEdge === "double" ? "3px" : "0px"],
    ["--brand-room-tab-ring", `${tab.ring}px`],
    ["--brand-room-tab-drop", `${tab.drop}px`],
    ["--brand-room-tab-lift", room.tabEdge === "lift" ? "1" : "0"]
  ];
}

/** Derived draft-room properties that differ by mode. */
function roomModeDeclarations(brand: BrandDefinition, mode: Mode): Declarations {
  const { room } = brand;
  const alpha = mode === "light" ? "0.05" : "0.28";
  const depth = {
    none: "0 0 0 0 transparent",
    soft: `0 1px 2px rgba(0, 0, 0, ${alpha}), 0 6px 16px rgba(0, 0, 0, ${alpha})`,
    glow: "0 0 10px rgba(var(--brand-accent-rgb), 0.35)"
  }[room.edge.depth];
  const ref = (slot: ColorSlot) => `var(--brand-${kebab(slot)})`;
  return [
    ["--brand-room-depth", depth],
    ["--brand-room-tab-edge", `var(--brand-${kebab(room.edge.ringColor)})`],
    ["--brand-room-tab-edge-on-primary", ref(resolveTabEdge(brand, mode, "on-primary"))],
    ["--brand-room-tab-edge-on-danger", ref(resolveTabEdge(brand, mode, "on-danger"))]
  ];
}

function modeDeclarations(
  brand: BrandDefinition,
  mode: Mode,
  prefix: string
): Declarations {
  const out: Declarations = [];
  const { colors, shadows } = brand.modes[mode];
  for (const slot of COLOR_SLOTS) {
    out.push([`${prefix}${kebab(slot)}`, colors[slot]]);
    out.push([`${prefix}${kebab(slot)}-rgb`, colorChannels(colors[slot])]);
  }
  for (const slot of SHADOW_SLOTS) {
    out.push([`${prefix}shadow-${slot}`, shadows[slot]]);
  }
  // The room's per-mode properties are only meaningful under the active-mode names.
  if (prefix === "--brand-") {
    out.push(...roomModeDeclarations(brand, mode));
    out.push(...homeModeDeclarations(brand, mode));
  }
  return out;
}

function commonDeclarations(brand: BrandDefinition): Declarations {
  const { type, wordmark, shape, navigation } = brand;
  const out: Declarations = [
    ["--brand-font-display", type.displayFont],
    ["--brand-font-body", type.bodyFont],
    ["--brand-font-numeral", type.numeralFont],
    ["--brand-font-label", type.labelFont],
    ["--brand-label-case", type.labelCase],
    ["--brand-label-letter-spacing", type.labelLetterSpacing],
    ["--brand-display-weight", type.displayWeight],
    ["--brand-display-case", type.displayCase],
    ["--brand-display-tracking", type.displayTracking],
    ["--brand-hero-tracking", type.heroTracking],
    ["--brand-display-word-spacing", type.displayWordSpacing],
    ["--brand-h1-size", type.h1Size],
    ["--brand-h2-size", type.h2Size],
    ["--brand-h3-size", type.h3Size],
    ["--brand-body-size", type.bodySize],
    ["--brand-font-accent", type.accentFont],
    ["--brand-accent-style", type.accentStyle],
    ["--brand-wordmark-font", wordmark.font],
    ["--brand-wordmark-weight", wordmark.weight],
    ["--brand-wordmark-case", wordmark.case],
    ["--brand-wordmark-letter-spacing", wordmark.letterSpacing],
    ["--brand-wordmark-two-tone", wordmark.twoTone],
    ["--brand-radius-sm", shape.radiusSm],
    ["--brand-radius-md", shape.radiusMd],
    ["--brand-radius-lg", shape.radiusLg],
    ["--brand-button-shape", shape.buttonShape],
    ["--brand-button-radius", buttonRadius(shape.buttonShape)],
    ["--brand-border-width", shape.borderWidth],
    ["--brand-rule-style", shape.ruleStyle],
    ["--brand-nav-active", navigation.activeTab],
    ["--brand-nav-font", navigation.font],
    ["--brand-nav-case", navigation.case],
    ["--brand-nav-size", navigation.size]
  ];
  for (const d of DECORATIONS) {
    out.push([`--brand-deco-${kebab(d)}`, brand.decorations[d] ? "1" : "0"]);
  }
  out.push(...derivedDeclarations(brand));
  out.push(...homeDeclarations(brand));
  out.push(...roomDeclarations(brand));
  // Both modes are always addressable by name, for tokens that mean "the dark
  // page" regardless of the active mode.
  for (const mode of MODES) {
    out.push(...modeDeclarations(brand, mode, `--brand-${mode}-`));
  }
  return out;
}

function block(selector: string, decls: Declarations): string {
  const body = decls.map(([k, v]) => `  ${k}: ${v};`).join("\n");
  return `${selector} {\n${body}\n}`;
}

function brandBlocks(
  brand: BrandDefinition,
  scope: string,
  extra: { common?: Declarations; dark?: Declarations; light?: Declarations } = {}
): string[] {
  return [
    block(scope, [...(extra.common ?? []), ...commonDeclarations(brand)]),
    block(`${scope}${DARK}`, [
      ...modeDeclarations(brand, "dark", "--brand-"),
      ...(extra.dark ?? [])
    ]),
    block(`${scope}${LIGHT}`, [
      ...modeDeclarations(brand, "light", "--brand-"),
      ...(extra.light ?? [])
    ])
  ];
}

/**
 * Stylesheet for all brands. The unscoped `:root` blocks carry `fallback`'s
 * values, so the first paint (before `data-brand` is set) and any unknown brand
 * render the fallback.
 */
export function generateBrandCss(
  brands: readonly BrandDefinition[],
  fallback: BrandDefinition
): string {
  const shared = {
    common: Object.entries(sharedConstants) as Declarations,
    dark: Object.entries(sharedByMode.dark) as Declarations,
    light: Object.entries(sharedByMode.light) as Declarations
  };
  const parts = [
    "/* Generated from src/theme/brands. Do not edit. */",
    ...brandBlocks(fallback, ":root", shared)
  ];
  for (const brand of brands) {
    parts.push(...brandBlocks(brand, `:root[data-brand="${brand.id}"]`));
  }
  return `${parts.join("\n\n")}\n`;
}
