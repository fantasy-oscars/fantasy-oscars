import { FormField } from "../../ui/forms";
import { Box, Button, Group, Stack, Text, Title } from "@mantine/core";
import { StandardCard } from "../../primitives";
import "../../primitives/baseline.css";

export function LeagueCreateScreen(props: {
  creating: boolean;
  error: string | null;
  onCreate: (e: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
}) {
  const { creating, error, onCreate } = props;

  return (
    <Box className="baseline-page">
      <Box className="baseline-pageInner">
        <Stack gap="md" component="section">
          <Box component="header">
            <Title order={2} className="baseline-textHeroTitle">
              Create league
            </Title>
            <Text className="baseline-textBody">
              Creating a league creates the initial season for the active ceremony.
            </Text>
          </Box>

          <StandardCard>
            <Box
              component="form"
              // Keep the existing layout composition (single column, sensible width).
              style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16, maxWidth: 520 }}
              onSubmit={onCreate}
            >
              <FormField label="Name" name="name" />
              <Group wrap="wrap" justify="flex-start">
                <Button type="submit" disabled={creating} variant="filled">
                  {creating ? "Creating..." : "Create league"}
                </Button>
                {error && (
                  <Text className="baseline-textMeta" c="red">
                    {error}
                  </Text>
                )}
              </Group>
            </Box>
          </StandardCard>
        </Stack>
      </Box>
    </Box>
  );
}
