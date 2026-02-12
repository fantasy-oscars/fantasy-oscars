import { Anchor, Box, Button, Group, Text, Title, useMantineColorScheme } from "@ui";
import { Link, Outlet } from "react-router-dom";

export function AuthLayout() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const themeToggleIcon = colorScheme === "dark" ? "\ue518" : "\ue51c";

  return (
    <Box className="auth-page">
      <Box className="auth-inner">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <Box component="header" className="auth-header">
          <Group justify="space-between" align="center" wrap="nowrap">
            <Anchor component={Link} to="/" className="brand" underline="never">
              <Title className="site-title" order={1}>
                Fantasy Oscars
              </Title>
            </Anchor>

            <Button
              type="button"
              variant="subtle"
              className="theme-toggle"
              onClick={() => setColorScheme(colorScheme === "dark" ? "light" : "dark")}
              aria-label={`Switch to ${colorScheme === "dark" ? "light" : "dark"} mode`}
            >
              <Text component="span" className="gicon" aria-hidden="true">
                {themeToggleIcon}
              </Text>
            </Button>
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
