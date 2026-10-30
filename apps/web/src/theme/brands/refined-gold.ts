import type { BrandDefinition, ColorSlots } from "./contract";

const SANS =
  '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const SERIF = '"Cinzel", ui-serif, Georgia, "Times New Roman", serif';

// PROVISIONAL slots (no counterpart in the pre-brand UI; invented to fill the
// contract, to be set from the design in the visual phase): faint, ruleStrong,
// accent (reuses the old gold wash), link, linkHover. The rest are today's values.
const dark: ColorSlots = {
  page: "#0d0d0d",
  surface: "#171717",
  raised: "#222222",
  sunken: "#222222",
  text: "#f7f8fc",
  muted: "rgba(247, 248, 252, 0.6)",
  faint: "rgba(247, 248, 252, 0.4)",
  rule: "rgba(247, 248, 252, 0.12)",
  ruleStrong: "rgba(247, 248, 252, 0.24)",
  primary: "#d4af37",
  onPrimary: "#0d0d0d",
  accent: "#efe6d0",
  link: "#f7f8fc",
  linkHover: "#d4af37",
  focusRing: "#d4af37"
};

const light: ColorSlots = {
  page: "#f7f8fc",
  surface: "#f2f3f7",
  raised: "#eeeff2",
  sunken: "#e9eaee",
  text: "#0d0d0d",
  muted: "rgba(13, 13, 13, 0.6)",
  faint: "rgba(13, 13, 13, 0.4)",
  rule: "rgba(13, 13, 13, 0.12)",
  ruleStrong: "rgba(13, 13, 13, 0.24)",
  primary: "#d4af37",
  onPrimary: "#0d0d0d",
  accent: "#efe6d0",
  link: "#0d0d0d",
  linkHover: "#8a6d12",
  focusRing: "#d4af37"
};

const shadows = {
  card: "0 1px 0 rgba(255, 255, 255, 0.03) inset, 0 10px 24px rgba(0, 0, 0, 0.22)",
  raised: "0 1px 0 rgba(255, 255, 255, 0.05) inset, 0 14px 34px rgba(0, 0, 0, 0.28)"
};

/** Today's look. */
export const refinedGold: BrandDefinition = {
  id: "refined-gold",
  modes: {
    light: { colors: light, shadows },
    dark: { colors: dark, shadows }
  },
  type: {
    displayFont: SERIF,
    bodyFont: SANS,
    numeralFont: SANS,
    labelFont: SANS,
    labelCase: "uppercase",
    labelLetterSpacing: "0.04em",
    h1Size: "32px",
    h2Size: "24px",
    h3Size: "18px",
    bodySize: "14px"
  },
  wordmark: {
    font: SERIF,
    weight: "700",
    case: "none",
    letterSpacing: "normal",
    twoTone: "colour"
  },
  shape: {
    radiusSm: "6px",
    radiusMd: "8px",
    radiusLg: "12px",
    buttonShape: "rounded",
    borderWidth: "1px",
    ruleStyle: "solid"
  },
  navigation: {
    activeTab: "underline",
    font: SANS,
    case: "none",
    size: "16px"
  },
  decorations: {
    doubleRules: false,
    offsetShadow: false,
    frameBorders: false,
    greasePencil: false
  },
  homeLayout: "refined-gold"
};
