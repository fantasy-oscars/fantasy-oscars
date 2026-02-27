import type { CSSVariablesResolver, MantineThemeOverride } from "@mantine/core";
import { foTokens } from "./tokens";

// Theme-first architecture:
// - All raw visual literals live in theme/ (this folder).
// - The app consumes CSS variables only (Mantine vars + our fo vars).

export const appTheme: MantineThemeOverride = {
  // Two-font system: serif for headings/titles, sans for everything else.
  fontFamily:
    '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  headings: {
    fontFamily: '"Cinzel", ui-serif, Georgia, "Times New Roman", serif',
    fontWeight: "var(--fo-font-weight-bold)"
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
        color: "yellow"
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
          border: "1px solid var(--fo-tooltip-border)"
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
    ...foTokens
  },
  // No component-scoped vars yet; keep all tokens at the root for predictability.
  light: {
    "--fo-tooltip-bg": "var(--mantine-color-gray-0)",
    "--fo-tooltip-color": "var(--mantine-color-dark-9)",
    "--fo-tooltip-border": "var(--mantine-color-gray-4)"
  },
  dark: {
    "--fo-tooltip-bg": "var(--mantine-color-dark-6)",
    "--fo-tooltip-color": "var(--mantine-color-gray-0)",
    "--fo-tooltip-border": "var(--mantine-color-dark-4)"
  }
});
