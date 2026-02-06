import { Outlet } from "react-router-dom";
import { Box, Divider, Text, Title } from "@mantine/core";
import "../../../primitives/baseline.css";

export function AdminContentLayout() {
  return (
    <Box component="section">
      <Box component="header">
        <Title order={2} className="baseline-textHeroTitle">
          Content
        </Title>
        <Text className="baseline-textBody">Manage what the app says and shows.</Text>
      </Box>
      <Divider my="md" />
      <Outlet />
    </Box>
  );
}
