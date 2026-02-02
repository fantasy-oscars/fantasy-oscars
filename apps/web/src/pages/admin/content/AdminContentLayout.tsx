import { Outlet } from "react-router-dom";
import { Box, Card, Text, Title } from "@mantine/core";

export function AdminContentLayout() {
  return (
    <Card className="card" component="section">
      <Box component="header">
        <Title order={2}>Content</Title>
        <Text className="muted">Manage what the app says and shows.</Text>
      </Box>

      <Outlet />
    </Card>
  );
}
