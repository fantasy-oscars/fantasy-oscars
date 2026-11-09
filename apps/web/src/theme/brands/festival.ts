import type { BrandDefinition, ColorSlots, ShadowSlots } from "./contract";
import { ARCHIVO, BARLOW, INSTRUMENT } from "./stacks";

// A film festival programme: white and laurel green, flat tiles, heavy Archivo
// titles, generous corners. Values follow
// docs/design/prescriptions/02-brand-tokens.md (3.8).
const dark: ColorSlots = {
  page: "#0e0e0e",
  surface: "#181816",
  raised: "#181816",
  sunken: "#22221f",
  text: "#f5f5f2",
  muted: "#a6a59e",
  faint: "#484847",
  rule: "#33332f",
  ruleStrong: "#6d6d6b",
  // A fill only in dark mode (3.00 on the page); thin readers use `text` (4.6).
  primary: "#1f6b4a",
  onPrimary: "#ffffff",
  accent: "#4fbf8a",
  link: "#4fbf8a",
  linkHover: "#8fd9b5",
  focusRing: "#f5f5f2"
};

const light: ColorSlots = {
  page: "#ffffff",
  surface: "#f5f5f2",
  raised: "#f5f5f2",
  sunken: "#ecebe6",
  text: "#0e0e0e",
  muted: "#5f5e58",
  faint: "#c3c3c3",
  rule: "#dedcd4",
  ruleStrong: "#868686",
  primary: "#1f6b4a",
  onPrimary: "#ffffff",
  accent: "#1f6b4a",
  link: "#1f6b4a",
  linkHover: "#134631",
  focusRing: "#0e0e0e"
};

// Flat tiles: the raised fill is the edge. Floating layers get a grey ring, no blur.
const lightShadows: ShadowSlots = {
  card: "0 0 0 0 transparent",
  raised: "0 0 0 0 transparent",
  overlay: "0 0 0 1px #868686",
  hero: "0 0 0 0 transparent"
};

const darkShadows: ShadowSlots = {
  card: "0 0 0 0 transparent",
  raised: "0 0 0 0 transparent",
  overlay: "0 0 0 1px #6d6d6b",
  hero: "0 0 0 1px #1f6b4a"
};

export const festival: BrandDefinition = {
  id: "festival",
  modes: {
    light: { colors: light, shadows: lightShadows },
    dark: { colors: dark, shadows: darkShadows }
  },
  type: {
    displayFont: ARCHIVO,
    bodyFont: INSTRUMENT,
    numeralFont: BARLOW,
    labelFont: ARCHIVO,
    labelCase: "none",
    labelLetterSpacing: "0em",
    displayWeight: "800",
    displayCase: "none",
    displayTracking: "normal",
    heroTracking: "normal",
    displayWordSpacing: "normal",
    h1Size: "38px",
    h2Size: "28px",
    h3Size: "20px",
    bodySize: "14px",
    accentFont: INSTRUMENT,
    accentStyle: "normal"
  },
  fonts: {
    faces: [
      { family: "Archivo", weights: [400, 500, 600, 700, 800, 900], styles: ["normal"] },
      { family: "Instrument Sans", weights: [400, 500, 600, 700], styles: ["normal"] },
      { family: "Barlow Condensed", weights: [700], styles: ["normal"] }
    ],
    preload: {
      display: { family: "Archivo", weight: 800, style: "normal" },
      body: { family: "Instrument Sans", weight: 400, style: "normal" }
    }
  },
  wordmark: {
    font: ARCHIVO,
    weight: "900",
    case: "none",
    letterSpacing: "-0.03em",
    twoTone: "stop",
    toneColor: "gold"
  },
  shape: {
    radiusSm: "12px",
    radiusMd: "16px",
    radiusLg: "20px",
    buttonShape: "pill",
    borderWidth: "1px",
    ruleStyle: "solid"
  },
  navigation: {
    activeTab: "pill",
    activeColor: "text",
    font: ARCHIVO,
    case: "none",
    size: "15px"
  },
  decorations: {
    doubleRules: false,
    offsetShadow: false,
    frameBorders: false,
    greasePencil: false
  },
  home: {
    placement: "column",
    heroSurface: "darkPanel",
    heroAlign: "start",
    heroMax: "64px",
    heroFit: 19,
    regions: "cards",
    ctaSurface: "primary"
  }
};
