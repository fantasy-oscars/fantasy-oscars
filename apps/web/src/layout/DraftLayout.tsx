import { Outlet } from "react-router-dom";
import { Box, MantineProvider } from "@mantine/core";
import { fantasyOscarsTheme } from "../theme/theme";
import "../primitives/draftLayout.css";

export function DraftLayout() {
  return (
    <MantineProvider
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
          <Box component="main" className="draftLayoutMain">
            <Outlet />
          </Box>
        </Box>
      </Box>
    </MantineProvider>
  );
}
