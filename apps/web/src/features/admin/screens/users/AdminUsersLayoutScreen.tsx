import type { ReactNode } from "react";
import { Box, Divider, Stack, Text, Title } from "@ui";
import "../../../primitives/baseline.css";

export function AdminUsersLayoutScreen(props: { children: ReactNode }) {
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
      {props.children}
    </Box>
  );
}
