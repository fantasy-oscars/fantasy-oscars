import { useEffect, useState } from "react";
import {
  Anchor,
  Box,
  Button,
  Group,
  Indicator,
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
import { AnimalAvatarIcon } from "../ui/animalAvatarIcon";
import { fetchJson } from "../lib/api";
import { RuntimeBannerStack } from "../notifications";

export function ShellLayout() {
  const { user, loading, sessionError, logout } = useAuthContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const themeToggleIcon = colorScheme === "dark" ? "\ue518" : "\ue51c";
  const [inviteCount, setInviteCount] = useState<number>(0);

  useEffect(() => {
    setUserMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;

    async function loadInvites() {
      if (!user) {
        setInviteCount(0);
        return;
      }
      const res = await fetchJson<{ invites: Array<{ id: number }> }>(
        "/seasons/invites/inbox",
        {
          method: "GET"
        }
      );
      if (cancelled) return;
      if (!res.ok) {
        setInviteCount(0);
        return;
      }
      setInviteCount(Array.isArray(res.data?.invites) ? res.data!.invites.length : 0);
    }

    void loadInvites();

    // Keep the chrome bell in sync:
    // - immediately on local invite actions (accept/decline)
    // - periodically, so invites sent from other users appear without a full refresh
    const onInvitesChanged = () => void loadInvites();
    const onFocus = () => void loadInvites();
    const interval =
      typeof window !== "undefined" ? window.setInterval(loadInvites, 15_000) : null;
    if (typeof window !== "undefined") {
      window.addEventListener("fo:invites-changed", onInvitesChanged as EventListener);
      window.addEventListener("focus", onFocus);
    }
    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener(
          "fo:invites-changed",
          onInvitesChanged as EventListener
        );
        window.removeEventListener("focus", onFocus);
        if (interval) window.clearInterval(interval);
      }
    };
  }, [user?.sub]);

  return (
    <Box className="page">
      <Box className="page-inner">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
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
                <Indicator
                  disabled={inviteCount <= 0}
                  label={inviteCount > 9 ? "9+" : String(inviteCount)}
                  size={16}
                  offset={4}
                  color="yellow"
                >
                  <Button
                    component={Link}
                    to="/invites"
                    type="button"
                    variant="subtle"
                    className="theme-toggle"
                    aria-label="Notifications"
                  >
                    <Text component="span" className="mi-icon" aria-hidden="true">
                      notifications
                    </Text>
                  </Button>
                </Indicator>
              ) : null}

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
                      leftSection={
                        <AnimalAvatarIcon avatarKey={user.avatar_key} size={26} />
                      }
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
            <RuntimeBannerStack />
            <BannerStack />
          </Box>
        )}

        <Box component="main" id="main-content" tabIndex={-1} className="site-content">
          <Outlet />
        </Box>

        <SiteFooter />
      </Box>
    </Box>
  );
}
