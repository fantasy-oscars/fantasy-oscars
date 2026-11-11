import type { BrandDefinition, ColorSlots, ShadowSlots } from "./contract";
import { CINZEL, DMSANS, PLAYFAIR } from "./stacks";

// Premiere night: near-black with velvet and gold, tight corners, hairlines instead
// of shadows. Values follow docs/design/prescriptions/02-brand-tokens.md (3.5).
const dark: ColorSlots = {
  page: "#0f0b0c",
  surface: "#1a1214",
  raised: "#1a1214",
  sunken: "#241a1c",
  text: "#f5ede6",
  muted: "#b8a8a0",
  faint: "#484442",
  rule: "#3a2a2d",
  ruleStrong: "#6d6865",
  primary: "#e2c25a",
  onPrimary: "#1a1214",
  // Velvet: a fill (hero gradient), never text on the dark page.
  accent: "#6e1a26",
  link: "#e2c25a",
  linkHover: "#f0d67e",
  focusRing: "#f5ede6"
};

const light: ColorSlots = {
  page: "#f7f0ea",
  surface: "#ffffff",
  raised: "#ffffff",
  sunken: "#efe4dc",
  text: "#1e1416",
  muted: "#6e5a58",
  faint: "#c1b9b5",
  rule: "#e2d2c8",
  ruleStrong: "#88807e",
  primary: "#d4af37",
  onPrimary: "#1a1214",
  accent: "#6e1a26",
  link: "#7c5e10",
  linkHover: "#5e480c",
  focusRing: "#1e1416"
};

const lightShadows: ShadowSlots = {
  card: "0 0 0 1px #e2d2c8",
  raised: "0 0 0 1px #88807e",
  overlay: "0 0 0 1px #88807e",
  hero: "0 0 0 1px #8e2a3a"
};

const darkShadows: ShadowSlots = {
  card: "0 0 0 1px #3a2a2d",
  raised: "0 0 0 1px #6d6865",
  overlay: "0 0 0 1px #6d6865",
  hero: "0 0 0 1px #8e2a3a"
};

export const redCarpet: BrandDefinition = {
  id: "red-carpet",
  modes: {
    light: { colors: light, shadows: lightShadows },
    dark: { colors: dark, shadows: darkShadows }
  },
  type: {
    displayFont: PLAYFAIR,
    bodyFont: DMSANS,
    numeralFont: PLAYFAIR,
    labelFont: DMSANS,
    labelCase: "uppercase",
    labelLetterSpacing: "0.12em",
    displayWeight: "600",
    displayCase: "none",
    displayTracking: "0.01em",
    heroTracking: "0.01em",
    displayWordSpacing: "0.12em",
    h1Size: "36px",
    h2Size: "28px",
    h3Size: "20px",
    bodySize: "14px",
    accentFont: PLAYFAIR,
    accentStyle: "italic"
  },
  fonts: {
    faces: [
      {
        family: "Playfair Display",
        weights: [400, 600, 700],
        styles: ["normal", "italic"]
      },
      { family: "DM Sans", weights: [400, 500, 600, 700], styles: ["normal"] },
      { family: "Cinzel", weights: [700], styles: ["normal"] }
    ],
    preload: {
      display: { family: "Playfair Display", weight: 600, style: "normal" },
      body: { family: "DM Sans", weight: 400, style: "normal" }
    }
  },
  wordmark: {
    font: CINZEL,
    weight: "700",
    case: "none",
    letterSpacing: "0.04em",
    twoTone: "colour",
    toneColor: "gold"
  },
  shape: {
    radiusSm: "4px",
    radiusMd: "6px",
    radiusLg: "6px",
    buttonShape: "rounded",
    borderWidth: "1px",
    ruleStyle: "solid"
  },
  navigation: {
    activeTab: "underline",
    activeColor: "gold",
    font: DMSANS,
    case: "uppercase",
    size: "13px"
  },
  decorations: {
    doubleRules: false,
    offsetShadow: false,
    frameBorders: false,
    greasePencil: false
  },
  home: {
    placement: "masthead",
    heroSurface: "accentPanel",
    heroAlign: "start",
    heroMax: "68px",
    heroFit: 18,
    regions: "open",
    ctaSurface: "card"
  },
  room: {
    workFont: DMSANS,
    titleFace: "display",
    edge: { ring: 1, ringColor: "rule", drop: 0, depth: "none" },
    tabEdge: "keyline"
  }
};
