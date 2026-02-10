import { useEffect, useMemo, useRef, useState } from "react";
import {
  Anchor,
  Box,
  Button,
  Divider,
  Drawer,
  Group,
  Indicator,
  Menu,
  Stack,
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
import { RuntimeBannerStack } from "../notifications";
import { useInviteCountOrchestration } from "../orchestration/chrome";

export function ShellLayout() {
  const { user, loading, sessionError, logout } = useAuthContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const navLinksRef = useRef<HTMLDivElement | null>(null);
  const [navMode, setNavMode] = useState<"inline" | "drawer">("inline");
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const themeToggleIcon = colorScheme === "dark" ? "\ue518" : "\ue51c";
  const { inviteCount } = useInviteCountOrchestration(user?.sub);

  useEffect(() => {
    setUserMenuOpen(false);
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const compute = () => {
      if (typeof window === "undefined") return;
      const w = window.innerWidth;
      if (w < 500) {
        setNavMode("drawer");
        return;
      }
      if (w <= 900) {
        const el = navLinksRef.current;
        if (!el) {
          // First render in this mode may happen before refs are attached.
          // Default to inline, then re-check on the next frame.
          setNavMode("inline");
          if (typeof window !== "undefined") window.requestAnimationFrame(compute);
          return;
        }
        // If links overflow their container, switch to drawer navigation.
        setNavMode(el.scrollWidth > el.clientWidth + 4 ? "drawer" : "inline");
        return;
      }
      setNavMode("inline");
    };

    // Run once (after layout), then on resize.
    const onResize = () => compute();
    compute();
    if (typeof window !== "undefined") {
      window.addEventListener("resize", onResize);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", onResize);
      }
    };
  }, [user?.is_admin]);

  const primaryLinks = useMemo(() => {
    const links: Array<{ to: string; label: string; adminOnly?: boolean }> = [
      { to: "/", label: "Home" },
      { to: "/about", label: "About" },
      { to: "/leagues", label: "Leagues" },
      { to: "/seasons", label: "Seasons" },
      { to: "/ceremonies", label: "Ceremonies" },
      { to: "/admin", label: "Admin", adminOnly: true }
    ];
    return links.filter((l) => !l.adminOnly || Boolean(user?.is_admin));
  }, [user?.is_admin]);

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
            <Group gap="sm" wrap="nowrap">
              {navMode === "drawer" ? (
                <Button
                  type="button"
                  variant="subtle"
                  className="theme-toggle"
                  onClick={() => setNavOpen(true)}
                  aria-label="Open menu"
                >
                  <Text component="span" className="mi-icon" aria-hidden="true">
                    menu
                  </Text>
                </Button>
              ) : null}

              <Anchor component={Link} to="/" className="brand" underline="never">
                <Title className="site-title" order={1}>
                  Fantasy Oscars
                </Title>
              </Anchor>
            </Group>

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

              {user && navMode === "inline" ? (
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
              ) : user && navMode === "drawer" ? (
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

              {user && navMode === "inline" ? (
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
              ) : !user && navMode === "inline" ? (
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
              ) : null}
            </Group>
          </Group>
        </Box>

        <Drawer
          opened={navOpen}
          onClose={() => setNavOpen(false)}
          position="left"
          withinPortal={false}
          title="Menu"
          size="xs"
        >
          <Stack gap="sm">
            <Stack gap={0}>
              {primaryLinks.map((l) => (
                <Anchor
                  key={l.to}
                  component={NavLink}
                  to={l.to}
                  className="nav-link"
                  underline="never"
                  onClick={() => setNavOpen(false)}
                  style={{ paddingBlock: 10 }}
                >
                  {l.label}
                </Anchor>
              ))}
            </Stack>

            <Divider />

            {user ? (
              <Stack gap={0}>
                <Anchor
                  component={NavLink}
                  to="/account"
                  className="nav-link"
                  underline="never"
                  onClick={() => setNavOpen(false)}
                  style={{ paddingBlock: 10 }}
                >
                  Account
                </Anchor>
                <Button
                  type="button"
                  variant="subtle"
                  color="red"
                  onClick={() => void logout()}
                  style={{ justifyContent: "flex-start", paddingInline: 0 }}
                >
                  Logout
                </Button>
              </Stack>
            ) : (
              <Stack gap={0}>
                <Anchor
                  component={NavLink}
                  to="/login"
                  className="nav-link"
                  underline="never"
                  onClick={() => setNavOpen(false)}
                  style={{ paddingBlock: 10 }}
                >
                  Login
                </Anchor>
                <Anchor
                  component={NavLink}
                  to="/register"
                  className="nav-link"
                  underline="never"
                  onClick={() => setNavOpen(false)}
                  style={{ paddingBlock: 10 }}
                >
                  Create account
                </Anchor>
              </Stack>
            )}
          </Stack>
        </Drawer>

        {sessionError && <PageError message={`Session error: ${sessionError}`} />}

        <Box
          component="nav"
          className={["site-nav", navMode === "drawer" ? "is-collapsed" : ""].join(" ")}
          aria-label="Primary"
          aria-hidden={navMode === "drawer" ? "true" : undefined}
        >
          <Group justify="space-between" wrap="wrap" w="100%">
            <Group ref={navLinksRef} className="nav-links" gap="md" wrap="nowrap">
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
