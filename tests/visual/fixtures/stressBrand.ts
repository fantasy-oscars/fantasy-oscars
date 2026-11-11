// The draft room's stress theme (docs/design/prescriptions/06, section 6.5): a brand
// definition at the far edge of every range the room contract allows. It exists only for
// the visual suite, which paints it over the default brand's page with
// `generateBrandCss([stress], stress)`; it is not in BRAND_DEFINITIONS or BRAND_IDS and no
// production code reads it. Typing it as `BrandDefinition` makes the compiler demand every
// slot, so a new slot cannot be added to the contract without a stress value.
import type {
  BrandDefinition,
  ColorSlots,
  FontFamily,
  ModeSlots
} from "../../../apps/web/src/theme/brands";
import { refinedGold } from "../../../apps/web/src/theme/brands/refined-gold";
import { CINZEL } from "../../../apps/web/src/theme/brands/stacks";

/**
 * Montserrat is the widest face that passes the working-text width check but is
 * deliberately not in ROOM_WORK_FONTS, so it is not in FONT_CATALOG either; the pinned file
 * is `montserrat-latin.woff2` (see fetch-stress-font.mjs).
 */
export const MONTSERRAT = '"Montserrat", ui-sans-serif, system-ui, sans-serif';
const MONTSERRAT_FAMILY = "Montserrat" as string as FontFamily;

/** The card edge at ring 3, drop 6: hard layers in the ink colour, as the room's shadow is built. */
function stressMode(mode: ModeSlots, colors: ColorSlots = mode.colors): ModeSlots {
  const ink = colors.text;
  const card = `0 0 0 3px ${ink}, 0 6px 0 3px ${ink}`;
  return {
    colors,
    shadows: { card, raised: card, overlay: card, hero: card }
  };
}

export const stressBrand: BrandDefinition = {
  // Borrows the default brand's slug so the generated blocks match the page the suite
  // paints it on; the visual suite labels these runs `stress`.
  id: refinedGold.id,
  modes: {
    light: stressMode(refinedGold.modes.light),
    // The default brand's dark action colour is light gold, which no ring colour can edge
    // against both the tab fill and the page; a deeper gold with white on it can.
    dark: stressMode(refinedGold.modes.dark, {
      ...refinedGold.modes.dark.colors,
      primary: "#8a6a10",
      onPrimary: "#ffffff"
    })
  },
  type: {
    ...refinedGold.type,
    displayFont: CINZEL,
    bodyFont: MONTSERRAT,
    labelFont: MONTSERRAT,
    numeralFont: MONTSERRAT,
    displayWeight: "700"
  },
  fonts: {
    faces: [
      { family: "Cinzel", weights: [400, 700], styles: ["normal"] },
      { family: MONTSERRAT_FAMILY, weights: [400, 500, 600, 700], styles: ["normal"] }
    ],
    preload: {
      display: { family: "Cinzel", weight: 700, style: "normal" },
      body: { family: MONTSERRAT_FAMILY, weight: 400, style: "normal" }
    }
  },
  wordmark: refinedGold.wordmark,
  shape: {
    radiusSm: "12px",
    radiusMd: "20px",
    radiusLg: "28px",
    buttonShape: "rounded",
    borderWidth: "2px",
    ruleStyle: "double"
  },
  navigation: refinedGold.navigation,
  decorations: { ...refinedGold.decorations, doubleRules: true },
  home: refinedGold.home,
  room: {
    workFont: MONTSERRAT,
    titleFace: "display",
    // The tab's drop clamps to 4 here (7 minus the ring), so its lowest edge is 61 px.
    edge: { ring: 3, ringColor: "text", drop: 6, depth: "glow" },
    tabEdge: "drop"
  }
};
