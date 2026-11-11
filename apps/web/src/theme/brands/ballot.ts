import type { BrandDefinition, ColorSlots, ShadowSlots } from "./contract";
import { BODONI, INSTRUMENT, PLEX } from "./stacks";

// A printed ballot: cream paper, ink rules and teal links, square corners. Values
// follow docs/design/prescriptions/02-brand-tokens.md (3.7).
const dark: ColorSlots = {
  page: "#14120f",
  surface: "#1c1a16",
  raised: "#1c1a16",
  sunken: "#24211c",
  text: "#ede6d6",
  muted: "#a39a88",
  faint: "#4a4741",
  rule: "#3a352d",
  ruleStrong: "#716d65",
  primary: "#ede6d6",
  onPrimary: "#14120f",
  accent: "#3fc1be",
  link: "#3fc1be",
  linkHover: "#7fd9d6",
  focusRing: "#ede6d6"
};

const light: ColorSlots = {
  page: "#f5f1e8",
  surface: "#fbf9f4",
  raised: "#fbf9f4",
  sunken: "#ebe6db",
  text: "#1c1a16",
  muted: "#5c554a",
  faint: "#bfbbb4",
  rule: "#d8d0c0",
  ruleStrong: "#84817b",
  primary: "#1c1a16",
  onPrimary: "#f5f1e8",
  accent: "#0c6e6e",
  link: "#0c6e6e",
  linkHover: "#0a5656",
  focusRing: "#1c1a16"
};

const lightShadows: ShadowSlots = {
  card: "0 0 0 1px #1c1a16",
  raised: "0 0 0 2px #1c1a16",
  overlay: "0 0 0 1px #1c1a16",
  hero: "0 0 0 0 transparent"
};

const darkShadows: ShadowSlots = {
  card: "0 0 0 1px #ede6d6",
  raised: "0 0 0 2px #ede6d6",
  overlay: "0 0 0 1px #ede6d6",
  hero: "0 0 0 0 transparent"
};

export const ballot: BrandDefinition = {
  id: "ballot",
  modes: {
    light: { colors: light, shadows: lightShadows },
    dark: { colors: dark, shadows: darkShadows }
  },
  type: {
    displayFont: BODONI,
    bodyFont: INSTRUMENT,
    numeralFont: BODONI,
    labelFont: PLEX,
    labelCase: "uppercase",
    labelLetterSpacing: "0.08em",
    displayWeight: "600",
    displayCase: "none",
    displayTracking: "normal",
    heroTracking: "normal",
    displayWordSpacing: "normal",
    h1Size: "40px",
    h2Size: "30px",
    h3Size: "20px",
    bodySize: "14px",
    accentFont: BODONI,
    accentStyle: "italic"
  },
  fonts: {
    faces: [
      { family: "Bodoni Moda", weights: [400, 600, 700], styles: ["normal", "italic"] },
      { family: "Instrument Sans", weights: [400, 500, 600, 700], styles: ["normal"] },
      { family: "IBM Plex Mono", weights: [500, 600], styles: ["normal"] }
    ],
    preload: {
      display: { family: "Bodoni Moda", weight: 600, style: "normal" },
      body: { family: "Instrument Sans", weight: 400, style: "normal" }
    }
  },
  wordmark: {
    font: BODONI,
    weight: "600",
    case: "none",
    letterSpacing: "normal",
    twoTone: "italic",
    toneColor: "accent"
  },
  shape: {
    radiusSm: "0",
    radiusMd: "0",
    radiusLg: "0",
    buttonShape: "square",
    borderWidth: "1px",
    ruleStyle: "double"
  },
  navigation: {
    activeTab: "underline",
    activeColor: "gold",
    font: PLEX,
    case: "uppercase",
    size: "12px"
  },
  decorations: {
    doubleRules: true,
    offsetShadow: false,
    frameBorders: false,
    greasePencil: false
  },
  home: {
    placement: "masthead",
    heroSurface: "open",
    heroAlign: "center",
    heroMax: "72px",
    heroFit: 16,
    regions: "open",
    ctaSurface: "card"
  },
  room: {
    workFont: INSTRUMENT,
    titleFace: "label",
    edge: { ring: 1, ringColor: "text", drop: 0, depth: "none" },
    tabEdge: "double"
  }
};
