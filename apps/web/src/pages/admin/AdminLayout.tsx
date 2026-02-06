import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Box, Group, Stack, Title } from "@mantine/core";
import "../../primitives/baseline.css";

export function AdminLayout() {
  const { pathname } = useLocation();
  const linkClass = (active: boolean) => `nav-link${active ? " active" : ""}`;

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
                <NavLink end to="/admin" className={linkClass(pathname === "/admin")}>
                  Home
                </NavLink>

                <NavLink
                  to="/admin/ceremonies"
                  className={linkClass(pathname.startsWith("/admin/ceremonies"))}
                >
                  Ceremonies
                </NavLink>

                <NavLink
                  to="/admin/category-templates"
                  className={linkClass(pathname.startsWith("/admin/category-templates"))}
                >
                  Category Templates
                </NavLink>

                <NavLink
                  to="/admin/users"
                  className={linkClass(pathname.startsWith("/admin/users"))}
                >
                  Users
                </NavLink>

                <NavLink
                  to="/admin/content"
                  className={linkClass(pathname.startsWith("/admin/content"))}
                >
                  Content &amp; Messaging
                </NavLink>

                <NavLink
                  to="/admin/system"
                  className={linkClass(pathname.startsWith("/admin/system"))}
                >
                  System
                </NavLink>
              </Group>
            </Box>
          </Box>

          <Stack className="admin-content" gap="md">
            <Outlet />
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
