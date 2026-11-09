import type { BrandDefinition, ColorSlots, ShadowSlots } from "./contract";
import { CINZEL, FRAUNCES, INTER } from "./stacks";

// Warm editorial look: ivory paper, warm ink, one metal. Values follow
// docs/design/prescriptions/02-brand-tokens.md (3.4, option 1).
const dark: ColorSlots = {
  page: "#12110f",
  surface: "#26231f",
  raised: "#1c1a17",
  sunken: "#26231f",
  text: "#f3eee3",
  muted: "#a89f8e",
  faint: "#4a443a",
  rule: "#36312a",
  ruleStrong: "#716e68",
  primary: "#e2c25a",
  onPrimary: "#12110f",
  accent: "#e2c25a",
  link: "#e2c25a",
  linkHover: "#f0d67e",
  focusRing: "#f3eee3"
};

const light: ColorSlots = {
  page: "#fbf8f1",
  surface: "#f3eee2",
  raised: "#ffffff",
  sunken: "#f3eee2",
  text: "#1c1a16",
  muted: "#6a6252",
  faint: "#d9cfb8",
  rule: "#e5ddcb",
  ruleStrong: "#898781",
  primary: "#d4af37",
  onPrimary: "#1c1a16",
  accent: "#7f6111",
  link: "#7f6111",
  linkHover: "#5e480c",
  focusRing: "#1c1a16"
};

const lightShadows: ShadowSlots = {
  card: "0 0 0 1px #e5ddcb, 0 1px 2px rgba(60, 45, 10, 0.05), 0 6px 16px rgba(60, 45, 10, 0.05)",
  raised:
    "0 0 0 1px #d9cfb8, 0 1px 2px rgba(60, 45, 10, 0.06), 0 8px 20px rgba(60, 45, 10, 0.08)",
  overlay:
    "0 0 0 1px #898781, 0 2px 6px rgba(60, 45, 10, 0.08), 0 16px 40px rgba(60, 45, 10, 0.16)",
  hero: "0 1px 2px rgba(60, 45, 10, 0.06), 0 8px 20px rgba(60, 45, 10, 0.08)"
};

const darkShadows: ShadowSlots = {
  card: "0 0 0 1px #36312a, 0 1px 2px rgba(0, 0, 0, 0.28), 0 6px 16px rgba(0, 0, 0, 0.28)",
  raised:
    "0 0 0 1px #4a443a, 0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 20px rgba(0, 0, 0, 0.35)",
  overlay: "0 0 0 1px #716e68, 0 16px 40px rgba(0, 0, 0, 0.5)",
  hero: "0 0 0 1px #6b5a2a, 0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 20px rgba(0, 0, 0, 0.35)"
};

/** The original brand and the default. */
export const refinedGold: BrandDefinition = {
  id: "refined-gold",
  modes: {
    light: { colors: light, shadows: lightShadows },
    dark: { colors: dark, shadows: darkShadows }
  },
  type: {
    displayFont: CINZEL,
    bodyFont: INTER,
    numeralFont: FRAUNCES,
    labelFont: INTER,
    labelCase: "uppercase",
    labelLetterSpacing: "0.1em",
    displayWeight: "700",
    displayCase: "none",
    displayTracking: "normal",
    heroTracking: "0.01em",
    displayWordSpacing: "normal",
    h1Size: "32px",
    h2Size: "24px",
    h3Size: "18px",
    bodySize: "14px",
    accentFont: INTER,
    accentStyle: "normal"
  },
  fonts: {
    faces: [
      { family: "Cinzel", weights: [400, 700], styles: ["normal"] },
      { family: "Inter", weights: [400, 500, 600, 700], styles: ["normal"] },
      { family: "Fraunces", weights: [600], styles: ["normal"] }
    ],
    preload: {
      display: { family: "Cinzel", weight: 700, style: "normal" },
      body: { family: "Inter", weight: 400, style: "normal" }
    }
  },
  wordmark: {
    font: CINZEL,
    weight: "700",
    case: "none",
    letterSpacing: "0.02em",
    twoTone: "colour",
    toneColor: "accent"
  },
  shape: {
    radiusSm: "10px",
    radiusMd: "12px",
    radiusLg: "14px",
    buttonShape: "rounded",
    borderWidth: "1px",
    ruleStyle: "solid"
  },
  navigation: {
    activeTab: "underline",
    activeColor: "accent",
    font: INTER,
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
    heroMax: "44px",
    heroFit: 12.5,
    regions: "cards",
    ctaSurface: "card"
  }
};
