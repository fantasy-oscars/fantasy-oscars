// Values that are the same in every brand: the win gold, status colours,
// podium metals, and a few neutral constants. Emitted once, under the final
// `--fo-*` names, outside any brand scope. Colours that differ between light
// and dark are split by mode; the rest are constants.

/** Same in both modes. */
export const sharedConstants = {
  // Destructive / error accent.
  "--fo-danger": "#b34b42",
  // Podium metals (gold is the win gold below).
  "--fo-medal-silver": "#bcc2cc",
  "--fo-medal-bronze": "#b07a3f",
  // Neutral channels for shadows and highlights, independent of brand colours.
  "--fo-black-rgb": "0, 0, 0",
  "--fo-white-rgb": "255, 255, 255",
  // Geometry and a system font stack that are not part of the brand contract.
  "--fo-radius-pill": "999px",
  "--fo-font-system":
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
} as const;

// Win gold ("this pick won") and status colours, from the design source.
// Nothing renders these yet: today's UI uses the primary action colour where it
// shows gold (`--fo-gold` still resolves to #d4af37 in both modes). Moving those
// consumers onto these tokens is a visual change, to be done in the visual phase.
export const sharedByMode = {
  light: {
    "--fo-win-gold": "#d4af37",
    "--fo-win-gold-on": "#0d0d0d",
    "--fo-win-gold-text": "#8a6a14",
    "--fo-status-complete": "#1f6b4a",
    "--fo-status-live": "#c8243b",
    "--fo-status-drafting": "#0f7b7b"
  },
  dark: {
    "--fo-win-gold": "#e2c25a",
    "--fo-win-gold-on": "#0d0d0d",
    "--fo-win-gold-text": "#8a6a14",
    "--fo-status-complete": "#4fbf8a",
    "--fo-status-live": "#f0566a",
    "--fo-status-drafting": "#3fc1be"
  }
} as const;
