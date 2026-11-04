import type { BrandDefinition, ColorSlots, ShadowSlots } from "./contract";
import { BARLOW, INTER } from "./stacks";

// A title card: black and white, condensed uppercase type, square edges. Values
// follow docs/design/prescriptions/02-brand-tokens.md (3.6).
const dark: ColorSlots = {
  page: "#0b0b0b",
  surface: "#161616",
  raised: "#161616",
  sunken: "#202020",
  text: "#f2f2f2",
  muted: "#a3a3a3",
  faint: "#454545",
  rule: "#2e2e2e",
  ruleStrong: "#6c6c6c",
  primary: "#f2f2f2",
  onPrimary: "#0b0b0b",
  accent: "#c9ccd1",
  link: "#f2f2f2",
  linkHover: "#c9ccd1",
  focusRing: "#f2f2f2"
};

const light: ColorSlots = {
  page: "#f4f4f4",
  surface: "#ffffff",
  raised: "#ffffff",
  sunken: "#e9e9e9",
  text: "#111111",
  muted: "#5a5a5a",
  faint: "#bbbbbb",
  rule: "#d0d0d0",
  ruleStrong: "#828282",
  primary: "#111111",
  onPrimary: "#f4f4f4",
  accent: "#62666d",
  link: "#111111",
  linkHover: "#5c6067",
  focusRing: "#111111"
};

const lightShadows: ShadowSlots = {
  card: "0 0 0 1px #d0d0d0",
  raised: "0 0 0 1px #828282",
  overlay: "0 0 0 1px #828282"
};

const darkShadows: ShadowSlots = {
  card: "0 0 0 1px #2e2e2e",
  raised: "0 0 0 1px #6c6c6c",
  overlay: "0 0 0 1px #6c6c6c"
};

export const noir: BrandDefinition = {
  id: "noir",
  modes: {
    light: { colors: light, shadows: lightShadows },
    dark: { colors: dark, shadows: darkShadows }
  },
  type: {
    displayFont: BARLOW,
    bodyFont: INTER,
    numeralFont: BARLOW,
    labelFont: INTER,
    labelCase: "uppercase",
    labelLetterSpacing: "0.12em",
    displayWeight: "700",
    displayCase: "uppercase",
    displayTracking: "normal",
    heroTracking: "0.01em",
    displayWordSpacing: "normal",
    h1Size: "40px",
    h2Size: "32px",
    h3Size: "22px",
    bodySize: "14px"
  },
  fonts: {
    faces: [
      { family: "Barlow Condensed", weights: [600, 700], styles: ["normal"] },
      { family: "Inter", weights: [400, 500, 600, 700], styles: ["normal"] }
    ],
    preload: {
      display: { family: "Barlow Condensed", weight: 700, style: "normal" },
      body: { family: "Inter", weight: 400, style: "normal" }
    }
  },
  wordmark: {
    font: BARLOW,
    weight: "700",
    case: "uppercase",
    letterSpacing: "0.02em",
    twoTone: "colour",
    toneColor: "gold"
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
    activeColor: "text",
    font: BARLOW,
    case: "uppercase",
    size: "20px"
  },
  decorations: {
    doubleRules: false,
    offsetShadow: false,
    frameBorders: false,
    greasePencil: false
  },
  homeLayout: "noir"
};
