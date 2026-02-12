import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Box, Group, Stack, Title } from "@ui";
import "../../primitives/baseline.css";

function navLinkClass(isActive: boolean) {
  return `nav-link${isActive ? " active" : ""}`;
}

export function AdminLayoutScreen(props: { children: ReactNode }) {
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

                <NavLink
                  to="/admin/ceremonies"
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  Ceremonies
                </NavLink>

                <NavLink
                  to="/admin/category-templates"
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  Category Templates
                </NavLink>

                <NavLink
                  to="/admin/films"
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  Films
                </NavLink>

                <NavLink
                  to="/admin/users"
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  Users
                </NavLink>

                <NavLink
                  to="/admin/content"
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  Content &amp; Messaging
                </NavLink>
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
