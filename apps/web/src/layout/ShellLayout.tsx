import { useEffect, useState } from "react";
import {
  Anchor,
  Box,
  Button,
  Group,
  Menu,
  Text,
  Title,
  useMantineColorScheme
} from "@mantine/core";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuthContext } from "../auth/context";
import { BannerStack } from "./BannerStack";
import { PageError } from "../ui/page-state";
import { SiteFooter } from "./SiteFooter";

export function ShellLayout() {
  const { user, loading, sessionError, logout } = useAuthContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const themeToggleIcon = colorScheme === "dark" ? "\ue518" : "\ue51c";

  useEffect(() => {
    setUserMenuOpen(false);
  }, [location.pathname]);

  return (
    <Box className="page">
      <Box className="page-inner">
        <Box component="header" className="site-header">
          <Group
            className="site-header-row"
            justify="space-between"
            align="center"
            wrap="nowrap"
          >
            <Anchor component={Link} to="/" className="brand" underline="never">
              <Title className="site-title" order={1}>
                Fantasy Oscars
              </Title>
            </Anchor>

            <Group
              className="site-header-actions"
              justify="flex-end"
              align="center"
              wrap="nowrap"
            >
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

              {user ? (
                <Menu
                  opened={userMenuOpen}
                  onChange={setUserMenuOpen}
                  withinPortal={false}
                >
                  <Menu.Target>
                    <Button
                      type="button"
                      variant="subtle"
                      rightSection={
                        <Text component="span" aria-hidden="true">
                          ▾
                        </Text>
                      }
                    >
                      {user.username ?? user.sub}
                    </Button>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item onClick={() => navigate("/account")}>Account</Menu.Item>
                    <Menu.Divider />
                    <Menu.Item color="red" onClick={() => void logout()}>
                      Logout
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              ) : (
                <>
                  {loading && (
                    <Text className="nav-muted" c="dimmed">
                      Checking…
                    </Text>
                  )}
                  <Button
                    component={Link}
                    to="/login"
                    state={{
                      from: `${location.pathname}${location.search ?? ""}${location.hash ?? ""}`
                    }}
                    variant="subtle"
                  >
                    Login
                  </Button>
                </>
              )}
            </Group>
          </Group>
        </Box>

        {sessionError && <PageError message={`Session error: ${sessionError}`} />}

        <Box component="nav" className="site-nav" aria-label="Primary">
          <Group justify="space-between" wrap="wrap" w="100%">
            <Group className="nav-links" gap="md" wrap="wrap">
              <Anchor component={NavLink} to="/" className="nav-link" underline="never">
                Home
              </Anchor>
              <Anchor
                component={NavLink}
                to="/about"
                className="nav-link"
                underline="never"
              >
                About
              </Anchor>
              <Anchor
                component={NavLink}
                to="/leagues"
                className="nav-link"
                underline="never"
              >
                Leagues
              </Anchor>
              <Anchor
                component={NavLink}
                to="/seasons"
                className="nav-link"
                underline="never"
              >
                Seasons
              </Anchor>
              <Anchor
                component={NavLink}
                to="/ceremonies"
                className="nav-link"
                underline="never"
              >
                Ceremonies
              </Anchor>
              {user?.is_admin && (
                <Anchor
                  component={NavLink}
                  to="/admin"
                  className="nav-link nav-link-admin"
                  underline="never"
                >
                  Admin
                </Anchor>
              )}
            </Group>
          </Group>
        </Box>

        {!location.pathname.startsWith("/drafts/") && (
          <Box className="banner-region">
            <BannerStack />
          </Box>
        )}

        <Box component="main" className="site-content">
          <Outlet />
        </Box>

        <SiteFooter />
      </Box>
    </Box>
  );
}
