import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Box, Card, Stack, Text, Title } from "@mantine/core";

export function AdminLayout() {
  const { pathname } = useLocation();
  const linkClass = (active: boolean) => `admin-link${active ? " is-active" : ""}`;

  return (
    <Box component="section" className="admin-shell">
      <Card className="admin-nav" component="aside" aria-label="Admin">
        <Box className="admin-nav-header">
          <Title order={2}>Admin</Title>
          <Text className="muted">Tools and configuration</Text>
        </Box>

        <Stack component="nav" className="admin-nav-links" aria-label="Admin sections">
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
        </Stack>
      </Card>

      <Box className="admin-content">
        <Outlet />
      </Box>
    </Box>
  );
}
