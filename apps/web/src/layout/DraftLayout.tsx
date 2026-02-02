import { Outlet } from "react-router-dom";
import { Box, MantineProvider } from "@mantine/core";
import { SiteFooter } from "./SiteFooter";
import { fantasyOscarsTheme } from "../theme/theme";

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
      <Box className="page draft-page">
        <Box className="draft-page-inner">
          <Box component="main" className="draft-content">
            <Outlet />
          </Box>
          <SiteFooter />
        </Box>
      </Box>
    </MantineProvider>
  );
}
