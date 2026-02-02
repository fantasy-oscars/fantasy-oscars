import type { MantineThemeOverride } from "@mantine/core";

// Design tokens are specified in `.codex/fantasy-oscars-codex-token-handoff.md`.
// This file centralizes bindings to Mantine theme knobs. Anything that can't be
// expressed in Mantine (e.g., "surface role inversion") is handled via CSS vars
// in `apps/web/src/styles.css`.

export const fantasyOscarsTheme: MantineThemeOverride = {
  fontFamily:
    '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  headings: {
    fontFamily: '"Cinzel", ui-serif, Georgia, "Times New Roman", serif',
    fontWeight: "700",
    sizes: {
      h1: { fontSize: "32px", lineHeight: "1.12" },
      h2: { fontSize: "24px", lineHeight: "1.2" },
      h3: { fontSize: "18px", lineHeight: "1.25" },
      h4: { fontSize: "14px", lineHeight: "1.25" },
      h5: { fontSize: "14px", lineHeight: "1.25" },
      h6: { fontSize: "14px", lineHeight: "1.25" }
    }
  },
  // Non–Draft Board sizes (authoritative).
  fontSizes: {
    xs: "12px",
    sm: "14px",
    md: "18px",
    lg: "24px",
    xl: "32px"
  },
  // Only token-defined spacing values are allowed; we alias higher steps to the
  // nearest token rather than introducing new sizes.
  spacing: {
    xs: "12px",
    sm: "16px",
    md: "24px",
    lg: "24px",
    xl: "24px"
  },
  // Single radius token applied globally.
  radius: {
    xs: "3px",
    sm: "3px",
    md: "3px",
    lg: "3px",
    xl: "3px"
  },
  components: {
    Button: {
      defaultProps: {
        variant: "default",
        radius: "sm"
      },
      styles: {
        root: {
          height: "32px",
          paddingInline: "12px",
          borderRadius: "3px",
          fontFamily: "Inter, ui-sans-serif, system-ui",
          fontSize: "14px",
          fontWeight: 700,
          boxShadow: "none"
        }
      }
    },
    Card: {
      defaultProps: {
        radius: "sm",
        padding: "md"
      },
      styles: {
        root: {
          borderRadius: "3px"
        }
      }
    }
  }
};
