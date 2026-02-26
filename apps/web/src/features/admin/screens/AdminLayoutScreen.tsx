import { useState, type FocusEvent, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Box, Group, Stack, Title } from "@ui";
import "@/primitives/baseline.css";

function navLinkClass(isActive: boolean) {
  return `nav-link${isActive ? " active" : ""}`;
}

export function AdminLayoutScreen(props: { children: ReactNode; isSuperAdmin: boolean }) {
  const [isGameContentOpen, setIsGameContentOpen] = useState(false);
  const location = useLocation();
  const gameContentActive =
    location.pathname.startsWith("/admin/ceremonies") ||
    location.pathname.startsWith("/admin/category-templates") ||
    location.pathname.startsWith("/admin/films");
  const gameContentOpen = isGameContentOpen || gameContentActive;
  const ceremoniesActive = location.pathname.startsWith("/admin/ceremonies");
  const templatesActive = location.pathname.startsWith("/admin/category-templates");
  const filmsActive = location.pathname.startsWith("/admin/films");

  function handleGameContentBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsGameContentOpen(false);
    }
  }

  return (
    <Box className="baseline-page">
      <Box className="baseline-pageInner">
        <Box component="section" className="admin-shell">
          <Box component="header" className="admin-header">
            <Title order={2} className="baseline-textHeroTitle">
              Admin
            </Title>
            <Box component="nav" className="site-nav" aria-label="Admin sections">
              <Group className="nav-links" gap="md" wrap="wrap">
                <NavLink
                  end
                  to="/admin"
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  Home
                </NavLink>

                <Box
                  className={`admin-navGroup${gameContentOpen ? " is-open" : ""}`}
                  onMouseEnter={() => setIsGameContentOpen(true)}
                  onMouseLeave={() => setIsGameContentOpen(false)}
                  onFocus={() => setIsGameContentOpen(true)}
                  onBlur={handleGameContentBlur}
                >
                  <NavLink
                    to="/admin/ceremonies"
                    className={`nav-link${gameContentActive ? " active" : ""}`}
                  >
                    Game Content{" "}
                    <span aria-hidden="true" className="admin-navTriggerCaret">
                      ▾
                    </span>
                  </NavLink>
                  <Box
                    className={`admin-navDrawer${gameContentOpen ? " is-open" : ""}`}
                    aria-hidden={!gameContentOpen}
                  >
                    <NavLink
                      to="/admin/ceremonies"
                      className={`nav-link admin-navDrawerLink${ceremoniesActive ? " active" : ""}`}
                    >
                      Ceremonies
                    </NavLink>
                    <NavLink
                      to="/admin/category-templates"
                      className={`nav-link admin-navDrawerLink${templatesActive ? " active" : ""}`}
                    >
                      Category Templates
                    </NavLink>
                    <NavLink
                      to="/admin/films"
                      className={`nav-link admin-navDrawerLink${filmsActive ? " active" : ""}`}
                    >
                      Films
                    </NavLink>
                  </Box>
                </Box>

                <NavLink
                  to="/admin/content"
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  Site &amp; Messaging
                </NavLink>

                {props.isSuperAdmin ? (
                  <>
                    <NavLink
                      to="/admin/users"
                      className={({ isActive }) => navLinkClass(isActive)}
                    >
                      Users
                    </NavLink>
                    <NavLink
                      to="/admin/destructive-actions"
                      className={({ isActive }) => navLinkClass(isActive)}
                    >
                      Critical Actions
                    </NavLink>
                  </>
                ) : null}
              </Group>
            </Box>
          </Box>

          <Stack className="admin-content" gap="md">
            {props.children}
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
