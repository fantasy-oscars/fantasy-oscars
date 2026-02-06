import { Outlet } from "react-router-dom";
import { Box, Divider, Stack, Text, Title } from "@mantine/core";
import "../../../primitives/baseline.css";

export function AdminUsersLayout() {
  return (
    <Box component="section">
      <Stack gap="sm">
        <Box component="header">
          <Title order={2} className="baseline-textHeroTitle">
            Users
          </Title>
          <Text className="baseline-textBody">Search for accounts and manage roles.</Text>
        </Box>
      </Stack>
      <Divider my="md" />
      <Outlet />
    </Box>
  );
}
