import { FormField } from "@/shared/forms";
import { Box, Group, Stack, Text, Title } from "@ui";
import { StandardCard } from "@/primitives";
import "@/primitives/baseline.css";
import { Button } from "@ui/Button";
import classes from "./LeagueCreateScreen.module.css";

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
              className={classes.form}
              onSubmit={onCreate}
            >
              <FormField label="Name" name="name" />
              <Group wrap="wrap" justify="flex-start">
                <Button type="submit" disabled={creating} variant="primary">
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
