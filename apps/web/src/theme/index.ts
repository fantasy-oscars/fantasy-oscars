import type { CSSVariablesResolver, MantineThemeOverride } from "@mantine/core";
import { foTokens } from "./tokens";

// Theme-first architecture:
// - All raw visual literals live in theme/brands/ (one definition per brand).
// - The app consumes CSS variables only (Mantine vars + our fo vars).

export const appTheme: MantineThemeOverride = {
  // Two-font system: serif for headings/titles, sans for everything else.
  fontFamily: "var(--brand-font-body)",
  headings: {
    fontFamily: "var(--brand-font-display)",
    fontWeight: "var(--brand-display-weight)"
  },

  // Preserve existing breakpoints (px) and centralize them here.
  // NOTE: Consumers should reference these via layout primitives / hooks.
  breakpoints: {
    xs: "500px",
    sm: "900px",
    md: "1200px",
    lg: "1400px",
    xl: "1600px"
  },

  // Map existing spacing/radius tokens into Mantine's system.
  spacing: {
    xs: foTokens["--fo-space-xs"],
    sm: foTokens["--fo-space-sm"],
    md: foTokens["--fo-space-md"],
    lg: foTokens["--fo-space-lg"],
    xl: foTokens["--fo-space-lg"]
  },
  radius: {
    xs: foTokens["--fo-radius-small"],
    sm: foTokens["--fo-radius-small"],
    md: foTokens["--fo-radius-small"],
    lg: foTokens["--fo-radius-large"],
    xl: foTokens["--fo-radius-large"]
  },

  // Default component behavior must be centralized here, not set ad hoc.
  components: {
    Button: {
      defaultProps: {
        variant: "default",
        radius: "sm"
      }
    },
    Indicator: {
      defaultProps: {
        size: 16,
        offset: 4,
        color: "blue"
      }
    },
    ActionIcon: {
      defaultProps: {
        variant: "subtle",
        radius: "sm"
      }
    },
    Card: {
      defaultProps: {
        radius: "sm",
        padding: "md"
      }
    },
    Modal: {
      defaultProps: {
        overlayProps: {
          opacity: 0.3,
          blur: 2
        }
      }
    },
    Tooltip: {
      styles: {
        tooltip: {
          backgroundColor: "var(--fo-tooltip-bg)",
          color: "var(--fo-tooltip-color)",
          border: 0,
          boxShadow: "var(--brand-shadow-overlay)"
        },
        arrow: {
          "--tooltip-bg": "var(--fo-tooltip-bg)"
        }
      }
    }
  }
};

// Export app-specific CSS variables from the theme layer so CSS never needs raw
// literals. This keeps brittle CSS layouts (draft room) stable while letting
// the theme remain the single source of truth.
export const appCssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    ...foTokens,
    // Tooltips are floating layers: the raised fill with the overlay edge (styles above).
    "--fo-tooltip-bg": "var(--brand-raised)",
    "--fo-tooltip-color": "var(--brand-text)"
  },
  light: {},
  dark: {}
});
