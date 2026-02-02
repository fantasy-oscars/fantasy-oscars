import { FormField } from "../../ui/forms";
import { Box, Button, Card, Group, Text, Title } from "@mantine/core";

export function LeagueCreateScreen(props: {
  creating: boolean;
  error: string | null;
  onCreate: (e: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
}) {
  const { creating, error, onCreate } = props;

  return (
    <Card className="card" component="section">
      <Box component="header">
        <Title order={2}>Create league</Title>
        <Text className="muted">
          Creating a league creates the initial season for the active ceremony.
        </Text>
      </Box>

      <Box component="form" className="grid" onSubmit={onCreate}>
        <FormField label="Name" name="name" />
        <Group className="inline-actions" wrap="wrap">
          <Button type="submit" disabled={creating}>
            {creating ? "Creating..." : "Create league"}
          </Button>
          {error && (
            <Text className="error" size="sm">
              {error}
            </Text>
          )}
        </Group>
      </Box>
    </Card>
  );
}
