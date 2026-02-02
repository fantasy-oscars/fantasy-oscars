import { Link } from "react-router-dom";
import { Box, Button, Card, Text, Title } from "@mantine/core";

export function NotFoundPage() {
  return (
    <Card className="card" component="section">
      <Box component="header">
        <Title order={2}>Not found</Title>
        <Text className="muted" c="dimmed">
          That page does not exist.
        </Text>
      </Box>
      <Button component={Link} to="/" variant="subtle">
        Go to home
      </Button>
    </Card>
  );
}
