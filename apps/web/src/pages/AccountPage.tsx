import { Link } from "react-router-dom";
import { Box, Button, Card, Group, List, Text, Title } from "@mantine/core";
import { useAuthContext } from "../auth/context";

export function AccountPage() {
  const { user, logout } = useAuthContext();
  return (
    <Card className="card" component="section">
      <Box component="header">
        <Title order={2}>Account</Title>
        <Text>Manage your profile and security.</Text>
      </Box>
      <Box className="stack">
        <Text className="muted" c="dimmed">
          Signed in as {user?.username ?? user?.sub ?? "unknown"}.
        </Text>
        <List className="pill-list">
          <List.Item className="pill">Username: {user?.username ?? "—"}</List.Item>
          <List.Item className="pill">Email: {user?.email ?? "—"}</List.Item>
        </List>
        <Group className="inline-actions" justify="flex-start">
          <Button type="button" onClick={() => void logout()}>
            Logout
          </Button>
          <Button component={Link} to="/reset" variant="subtle">
            Password reset
          </Button>
        </Group>
      </Box>
    </Card>
  );
}
