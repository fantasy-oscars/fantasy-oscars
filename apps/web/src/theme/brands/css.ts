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
      tone === "colour" ? colorRef(wordmark.toneColor) : "inherit"
    ],
    ["--brand-wordmark-tone-style", tone === "italic" ? "italic" : "normal"],
    [
      "--brand-wordmark-tone-weight",
      tone === "italic" || tone === "weight" ? "400" : "inherit"
    ],
    ["--brand-wordmark-stop-display", tone === "stop" ? "inline" : "none"],
    ["--brand-wordmark-stop-color", colorRef(wordmark.toneColor)]
  ];
}

/** Derived Home properties (see the Home layouts prescription, 3.2). */
function homeDeclarations(brand: BrandDefinition): Declarations {
  const { home, shape } = brand;
  const panel = home.heroSurface !== "open";
  const open = home.regions === "open";
  const primary = home.ctaSurface === "primary";
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
      home.placement === "masthead"
        ? '"hero hero" "updates aside"'
        : '"hero aside" "updates aside"'
    ],
    ["--brand-home-hero-panel", panel ? "1" : "0"],
    ["--brand-home-hero-bg", heroBg],
    ["--brand-home-hero-fg", heroFg],
    ["--brand-home-hero-fg-rgb", heroFgRgb],
    ["--brand-home-hero-muted", heroMuted],
    ["--brand-home-hero-radius", panel ? "var(--brand-radius-lg)" : "0"],
    ["--brand-home-hero-rule", panel ? "0 solid transparent" : openRule],
    ["--brand-home-hero-align", home.heroAlign],
    ["--brand-home-hero-tagline-inline", home.heroAlign === "center" ? "auto" : "0"],
    ["--brand-home-hero-max", home.heroMax],
    ["--brand-home-hero-fit", String(home.heroFit)],
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
  if (prefix === "--brand-") out.push(...roomModeDeclarations(brand, mode));
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
