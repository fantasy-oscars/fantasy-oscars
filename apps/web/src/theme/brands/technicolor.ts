import type { BrandDefinition, ColorSlots, ShadowSlots } from "./contract";
import { DMSANS, FRAUNCES } from "./stacks";

// A three-strip Technicolor poster: cream and cherry, heavy Fraunces titles,
// thick ink outlines with an offset shadow. Values follow
// docs/design/prescriptions/02-brand-tokens.md (3.9).
const dark: ColorSlots = {
  page: "#1e1210",
  surface: "#3a251e",
  raised: "#2a1a16",
  sunken: "#3a251e",
  text: "#fff1dc",
  muted: "#d1b79c",
  faint: "#6e5443",
  rule: "#4a3328",
  ruleStrong: "#8f8276",
  // A fill only on surface and sunken (2.58); thin readers use `link` and `text`.
  primary: "#c8243b",
  onPrimary: "#fff6e5",
  accent: "#3fc1be",
  link: "#f7707f",
  linkHover: "#ff9aa5",
  focusRing: "#fff1dc"
};

const light: ColorSlots = {
  page: "#fff6e5",
  surface: "#fbe9c9",
  raised: "#fffdf7",
  sunken: "#fbe9c9",
  text: "#2a1a12",
  muted: "#6e5443",
  faint: "#c9a97a",
  rule: "#edd3a6",
  ruleStrong: "#908477",
  primary: "#c8243b",
  onPrimary: "#fff6e5",
  accent: "#0c6e6e",
  link: "#b01f34",
  linkHover: "#7e1626",
  focusRing: "#2a1a12"
};

// The card edge is a 2 px ink outline plus a 5 px offset; hover lifts the offset to 7 px.
const lightShadows: ShadowSlots = {
  card: "0 0 0 2px #2a1a12, 0 5px 0 2px #2a1a12",
  raised: "0 0 0 2px #2a1a12, 0 7px 0 2px #2a1a12",
  overlay: "0 0 0 2px #2a1a12, 0 5px 0 2px #2a1a12"
};

const darkShadows: ShadowSlots = {
  card: "0 0 0 2px #f3ddbb, 0 5px 0 2px #f3ddbb",
  raised: "0 0 0 2px #f3ddbb, 0 7px 0 2px #f3ddbb",
  overlay: "0 0 0 2px #f3ddbb, 0 5px 0 2px #f3ddbb"
};

export const technicolor: BrandDefinition = {
  id: "technicolor",
  modes: {
    light: { colors: light, shadows: lightShadows },
    dark: { colors: dark, shadows: darkShadows }
  },
  type: {
    displayFont: FRAUNCES,
    bodyFont: DMSANS,
    numeralFont: FRAUNCES,
    labelFont: FRAUNCES,
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
    bodySize: "14px"
  },
  fonts: {
    faces: [
      { family: "Fraunces", weights: [400, 600, 700, 800, 900], styles: ["normal"] },
      { family: "DM Sans", weights: [400, 500, 600, 700], styles: ["normal"] }
    ],
    preload: {
      display: { family: "Fraunces", weight: 800, style: "normal" },
      body: { family: "DM Sans", weight: 400, style: "normal" }
    }
  },
  wordmark: {
    font: FRAUNCES,
    weight: "900",
    case: "none",
    letterSpacing: "normal",
    twoTone: "colour",
    toneColor: "accent"
  },
  shape: {
    radiusSm: "12px",
    radiusMd: "18px",
    radiusLg: "24px",
    buttonShape: "rounded",
    borderWidth: "2px",
    ruleStyle: "solid"
  },
  navigation: {
    activeTab: "pill",
    activeColor: "primary",
    font: DMSANS,
    case: "none",
    size: "15px"
  },
  decorations: {
    doubleRules: false,
    offsetShadow: true,
    frameBorders: false,
    greasePencil: false
  },
  homeLayout: "technicolor"
};
