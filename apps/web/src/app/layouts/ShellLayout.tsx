import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent
} from "react";
import { Box } from "@ui";
import { Outlet, useLocation } from "react-router-dom";
import { useAuthContext } from "@/auth/context";
import { hasOperatorAccess } from "@/auth/roles";
import { useBrandContext } from "@/brand/context";
import { focusAppearanceHeading } from "@/app/chrome/appearanceAnchor";
import { handleWordmarkClick } from "@/app/chrome/wordmarkClick";
import { BannerStack } from "./BannerStack";
import { PageError } from "@/shared/page-state";
import { SiteFooter } from "./SiteFooter";
import { RuntimeBannerStack } from "@/notifications";
import { useInviteCountOrchestration } from "@/orchestration/chrome";
import { ShellHeader } from "@/app/chrome/ui/ShellHeader";
import { ShellNavDrawer } from "@/app/chrome/ui/ShellNavDrawer";
import { ShellPrimaryNav } from "@/app/chrome/ui/ShellPrimaryNav";
import { useShellNavMode } from "./useShellNavMode";

export function ShellLayout() {
  const { user, loading, sessionError, sessionRequestId, logout } = useAuthContext();
  const location = useLocation();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const navLinksRef = useRef<HTMLDivElement | null>(null);
  // The drawer hands focus back to the menu button as it closes; the Appearance heading
  // takes it once that has happened, as the desktop menu's route does.
  const focusAppearanceOnExit = useRef(false);
  const headerRowRef = useRef<HTMLDivElement | null>(null);
  const { inviteCount } = useInviteCountOrchestration(user?.sub);
  const { shuffle } = useBrandContext();

  // On Home, a plain click on the wordmark shuffles the theme instead of navigating.
  const onWordmarkClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) =>
      handleWordmarkClick(event, location.pathname, shuffle),
    [location.pathname, shuffle]
  );

  const { navMode } = useShellNavMode({
    navLinksRef,
    headerRowRef,
    userIsAdmin: hasOperatorAccess(user),
    sessionKey: loading ? "loading" : user ? "in" : "out"
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
    return links.filter((l) => !l.adminOnly || hasOperatorAccess(user));
  }, [user]);

  return (
    <Box className="page">
      <Box className="page-inner">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <ShellHeader
          navMode={navMode}
          rowRef={headerRowRef}
          navDrawerOpen={navOpen}
          onOpenNavDrawer={() => setNavOpen(true)}
          user={
            user
              ? {
                  sub: user.sub,
                  username: user.username ?? null,
                  is_admin: Boolean(user.is_admin),
                  admin_role: user.admin_role ?? "NONE",
                  avatar_key: user.avatar_key ?? null
                }
              : null
          }
          loading={loading}
          logout={logout}
          inviteCount={inviteCount}
          userMenuOpen={userMenuOpen}
          setUserMenuOpen={setUserMenuOpen}
          onWordmarkClick={onWordmarkClick}
        />

        <ShellNavDrawer
          opened={navOpen}
          onClose={() => setNavOpen(false)}
          primaryLinks={primaryLinks.map(({ to, label }) => ({ to, label }))}
          user={user ? { sub: user.sub } : null}
          onLogout={logout}
          onChooseAppearance={() => {
            focusAppearanceOnExit.current = true;
            setNavOpen(false);
          }}
          onExited={() => {
            if (!focusAppearanceOnExit.current) return;
            focusAppearanceOnExit.current = false;
            focusAppearanceHeading();
          }}
        />

        {sessionError && (
          <PageError
            message={`Session error: ${sessionError}`}
            requestId={sessionRequestId}
          />
        )}

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
