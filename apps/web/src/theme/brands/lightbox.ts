import type { BrandDefinition, ColorSlots, ShadowSlots } from "./contract";
import { ARCHIVO, PLEX } from "./stacks";

// A contact sheet on a light table: black frames, mono titles, a cherry grease
// pencil. Values follow docs/design/prescriptions/02-brand-tokens.md (3.10).
const dark: ColorSlots = {
  page: "#170f10",
  surface: "#221718",
  raised: "#221718",
  sunken: "#2c1f20",
  text: "#f2e6e4",
  muted: "#b49a98",
  faint: "#6e5254",
  rule: "#4a3537",
  ruleStrong: "#756b6b",
  primary: "#f2e6e4",
  onPrimary: "#170f10",
  accent: "#f0566a",
  link: "#f2e6e4",
  linkHover: "#b49a98",
  focusRing: "#f2e6e4"
};

const light: ColorSlots = {
  page: "#ecedea",
  surface: "#ffffff",
  raised: "#ffffff",
  sunken: "#e4e5e1",
  text: "#141414",
  muted: "#575754",
  faint: "#a8a8a3",
  rule: "#cfcfcb",
  ruleStrong: "#7f807e",
  primary: "#141414",
  onPrimary: "#ffffff",
  accent: "#b8213a",
  link: "#141414",
  linkHover: "#575754",
  focusRing: "#141414"
};

// The frame is the card edge; hover thickens it to 2 px.
const lightShadows: ShadowSlots = {
  card: "0 0 0 1px #141414",
  raised: "0 0 0 2px #141414",
  overlay: "0 0 0 1px #141414",
  hero: "inset 0 0 0 6px #ffffff, 0 0 0 1px #141414"
};

const darkShadows: ShadowSlots = {
  card: "0 0 0 1px #f2e6e4",
  raised: "0 0 0 2px #f2e6e4",
  overlay: "0 0 0 1px #f2e6e4",
  hero: "inset 0 0 0 6px #4a3537, 0 0 0 1px #f2e6e4"
};

export const lightbox: BrandDefinition = {
  id: "lightbox",
  modes: {
    light: { colors: light, shadows: lightShadows },
    dark: { colors: dark, shadows: darkShadows }
  },
  type: {
    displayFont: PLEX,
    bodyFont: ARCHIVO,
    numeralFont: PLEX,
    labelFont: PLEX,
    labelCase: "uppercase",
    labelLetterSpacing: "0em",
    displayWeight: "600",
    displayCase: "none",
    displayTracking: "normal",
    heroTracking: "normal",
    displayWordSpacing: "normal",
    h1Size: "32px",
    h2Size: "24px",
    h3Size: "16px",
    bodySize: "14px",
    accentFont: ARCHIVO,
    accentStyle: "normal"
  },
  fonts: {
    faces: [
      { family: "IBM Plex Mono", weights: [400, 500, 600, 700], styles: ["normal"] },
      { family: "Archivo", weights: [400, 500, 600, 700], styles: ["normal"] }
    ],
    preload: {
      display: { family: "IBM Plex Mono", weight: 600, style: "normal" },
      body: { family: "Archivo", weight: 400, style: "normal" }
    }
  },
  wordmark: {
    font: PLEX,
    weight: "600",
    case: "none",
    letterSpacing: "-0.02em",
    twoTone: "weight",
    toneColor: "accent"
  },
  shape: {
    radiusSm: "0",
    radiusMd: "0",
    radiusLg: "0",
    buttonShape: "square",
    borderWidth: "1px",
    ruleStyle: "solid"
  },
  navigation: {
    activeTab: "underline",
    activeColor: "accent",
    font: PLEX,
    case: "none",
    size: "13px"
  },
  decorations: {
    doubleRules: false,
    offsetShadow: false,
    frameBorders: true,
    greasePencil: true
  },
  home: {
    placement: "column",
    heroSurface: "darkPanel",
    heroAlign: "start",
    heroMax: "32px",
    heroFit: 15,
    regions: "cards",
    ctaSurface: "card"
  }
};
