import { Group, Text, Title } from "@ui";

/** "Settings" with the status line at the end ("Scoring saved." for 3 s). */
export function SettingsHeading(props: { statusLine: string }) {
  return (
    <Group justify="space-between" align="center" wrap="wrap" gap="sm">
      <Title order={3} variant="section">
        Settings
      </Title>
      <Text variant="meta" role="status" aria-live="polite">
        {props.statusLine}
      </Text>
    </Group>
  );
}
