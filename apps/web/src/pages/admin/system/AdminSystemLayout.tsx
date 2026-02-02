import { NavLink, Outlet } from "react-router-dom";
import { Box, Card, Group, Text, Title } from "@mantine/core";

export function AdminSystemLayout() {
  const sublinkClass = ({ isActive }: { isActive: boolean }) =>
    `admin-sublink${isActive ? " is-active" : ""}`;

  return (
    <Card className="card" component="section">
      <Box component="header">
        <Title order={2}>System</Title>
        <Text className="muted">Operational tools and audit trails.</Text>
      </Box>

      <Group
        component="nav"
        className="admin-subnav"
        aria-label="System admin"
        wrap="wrap"
      >
        <NavLink to="/admin/system/audit" className={sublinkClass}>
          Audit Log
        </NavLink>
      </Group>

      <Outlet />
    </Card>
  );
}
