import { Outlet } from "react-router-dom";
import { Box } from "@ui";
import "../primitives/draftLayout.css";

export function DraftLayout() {
  return (
    <Box className="draftLayoutRoot">
      <Box className="draftLayoutInner">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <Box component="main" id="main-content" tabIndex={-1} className="draftLayoutMain">
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
