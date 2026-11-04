import { Box, Group, Text, Tooltip, UnstyledButton, useMantineColorScheme } from "@ui";
import { Outlet } from "react-router-dom";
import { Wordmark } from "@/app/chrome/ui/Wordmark";

export function AuthLayout() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const themeToggleIcon = colorScheme === "dark" ? "\ue518" : "\ue51c";
  const themeLabel = `Switch to ${colorScheme === "dark" ? "light" : "dark"} mode`;

  return (
    <Box className="auth-page">
      <Box className="auth-inner">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <Box component="header" className="auth-header">
          <Group justify="space-between" align="center" wrap="nowrap">
            <Wordmark />

            <Tooltip label={themeLabel} openDelay={400}>
              <UnstyledButton
                type="button"
                className="fo-headerIconBtn"
                onClick={() => setColorScheme(colorScheme === "dark" ? "light" : "dark")}
                aria-label={themeLabel}
              >
                <Text component="span" className="gicon" aria-hidden="true">
                  {themeToggleIcon}
                </Text>
              </UnstyledButton>
            </Tooltip>
          </Group>
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
