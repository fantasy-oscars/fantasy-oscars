import { useEffect, useMemo, useRef, useState } from "react";
import { Box, useMantineColorScheme } from "@ui";
import { Outlet, useLocation } from "react-router-dom";
import { useAuthContext } from "../auth/context";
import { BannerStack } from "./BannerStack";
import { PageError } from "../ui/page-state";
import { SiteFooter } from "./SiteFooter";
import { RuntimeBannerStack } from "../notifications";
import { useInviteCountOrchestration } from "../orchestration/chrome";
import { ShellHeader } from "../ui/chrome/ShellHeader";
import { ShellNavDrawer } from "../ui/chrome/ShellNavDrawer";
import { ShellPrimaryNav } from "../ui/chrome/ShellPrimaryNav";
import { useShellNavMode } from "./useShellNavMode";

export function ShellLayout() {
  const { user, loading, sessionError, logout } = useAuthContext();
  const location = useLocation();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const navLinksRef = useRef<HTMLDivElement | null>(null);
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const themeToggleIcon = colorScheme === "dark" ? "\ue518" : "\ue51c";
  const { inviteCount } = useInviteCountOrchestration(user?.sub);

  const { navMode } = useShellNavMode({
    navLinksRef,
    userIsAdmin: Boolean(user?.is_admin)
  });

  useEffect(() => {
    setUserMenuOpen(false);
    setNavOpen(false);
  }, [location.pathname]);

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
        <ShellHeader
          navMode={navMode}
          onOpenNavDrawer={() => setNavOpen(true)}
          user={
            user
              ? {
                  sub: user.sub,
                  username: user.username ?? null,
                  is_admin: Boolean(user.is_admin),
                  avatar_key: user.avatar_key ?? null
                }
              : null
          }
          loading={loading}
          logout={logout}
          inviteCount={inviteCount}
          userMenuOpen={userMenuOpen}
          setUserMenuOpen={setUserMenuOpen}
          colorScheme={colorScheme}
          setColorScheme={setColorScheme}
          themeToggleIcon={themeToggleIcon}
        />

        <ShellNavDrawer
          opened={navOpen}
          onClose={() => setNavOpen(false)}
          primaryLinks={primaryLinks.map(({ to, label }) => ({ to, label }))}
          user={user ? { sub: user.sub } : null}
          onLogout={logout}
        />

        {sessionError && <PageError message={`Session error: ${sessionError}`} />}

        <ShellPrimaryNav
          navMode={navMode}
          navLinksRef={navLinksRef}
          links={primaryLinks.map(({ to, label }) => ({ to, label }))}
        />

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
