import { Outlet } from "react-router-dom";
import { Box, HeadlessMantineProvider } from "@mantine/core";
import { fantasyOscarsTheme } from "../theme/theme";
import "../primitives/draftLayout.css";

export function DraftLayout() {
  return (
    // Use HeadlessMantineProvider to avoid creating a second color-scheme manager/context.
    // Draft board only needs a theme override (headings font), not a new color scheme source.
    <HeadlessMantineProvider
      theme={{
        ...fantasyOscarsTheme,
        // Draft Board rule: sans only (override global serif headings).
        headings: {
          fontFamily:
            '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
        }
      }}
    >
      <Box className="draftLayoutRoot">
        <Box className="draftLayoutInner">
          <a className="skip-link" href="#main-content">
            Skip to content
          </a>
          <Box
            component="main"
            id="main-content"
            tabIndex={-1}
            className="draftLayoutMain"
          >
            <Outlet />
          </Box>
        </Box>
      </Box>
    </HeadlessMantineProvider>
  );
}
