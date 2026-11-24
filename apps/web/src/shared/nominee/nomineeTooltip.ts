// Tooltips are primarily a desktop affordance (hover/focus). On touch devices the
// positioning can end up off-screen; mobile uses the tap-to-open nominee card instead.
export const NOMINEE_TOOLTIP_EVENTS = { hover: true, focus: true, touch: false } as const;

export { FO_TOOLTIP_OFFSET_PX as NOMINEE_TOOLTIP_OFFSET_PX } from "@/tokens/overlays";

export const NOMINEE_CARD_TOOLTIP_STYLES = {
  tooltip: {
    padding: 0,
    background: "transparent",
    border: "none",
    boxShadow: "none"
  }
} as const;

/**
 * An armed nominee's card holds the confirm button, so it must take the pointer
 * (Mantine tooltips ignore it by default). Other cards stay click-through.
 */
export const NOMINEE_CARD_TOOLTIP_ARMED_STYLES = {
  tooltip: { ...NOMINEE_CARD_TOOLTIP_STYLES.tooltip, pointerEvents: "auto" }
} as const;
