import { Box } from "@ui";
import { Outlet } from "react-router-dom";
import { Wordmark } from "@/app/chrome/ui/Wordmark";

export function AuthLayout() {
  return (
    <Box className="auth-page">
      <Box className="auth-inner">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <Box component="header" className="auth-header">
          <Wordmark />
        </Box>

        <Box
          component="main"
          id="main-content"
          tabIndex={-1}
          className="auth-content"
          mt="xl"
        >
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
