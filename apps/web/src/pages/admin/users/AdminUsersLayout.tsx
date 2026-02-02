import { NavLink, Outlet } from "react-router-dom";
import { Box, Card, Group, Text, Title } from "@mantine/core";

export function AdminUsersLayout() {
  const sublinkClass = ({ isActive }: { isActive: boolean }) =>
    `admin-sublink${isActive ? " is-active" : ""}`;

  return (
    <Card className="card" component="section">
      <Box component="header">
        <Title order={2}>Users</Title>
        <Text className="muted">Search for accounts and manage roles.</Text>
      </Box>

      <Group component="nav" className="admin-subnav" aria-label="User admin" wrap="wrap">
        <NavLink end to="/admin/users" className={sublinkClass}>
          Search
        </NavLink>
      </Group>

      <Outlet />
    </Card>
  );
}
