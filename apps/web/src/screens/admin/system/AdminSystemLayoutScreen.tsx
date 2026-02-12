import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Box, Divider, Group, Text, Title } from "@ui";
import "../../../primitives/baseline.css";

export function AdminSystemLayoutScreen(props: { children: ReactNode }) {
  const sublinkClass = ({ isActive }: { isActive: boolean }) =>
    `admin-sublink${isActive ? " is-active" : ""}`;

  return (
    <Box component="section">
      <Box component="header">
        <Title order={2} className="baseline-textHeroTitle">
          System
        </Title>
        <Text className="baseline-textBody">Operational tools and audit trails.</Text>
      </Box>

      <Divider my="md" />

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

      <Divider my="md" />

      {props.children}
    </Box>
  );
}
