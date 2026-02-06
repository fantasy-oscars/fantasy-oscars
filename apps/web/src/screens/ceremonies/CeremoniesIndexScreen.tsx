import { Card, Group, Stack, Text, Title } from "@mantine/core";
import { Link } from "react-router-dom";
import { PageError, PageLoader } from "../../ui/page-state";
import type { CeremonyIndexRow } from "../../orchestration/ceremonies";

function CeremonyCard(props: { ceremony: CeremonyIndexRow; tone: "active" | "archived" }) {
  const c = props.ceremony;
  const label = c.name?.trim() || c.code?.trim() || `Ceremony #${c.id}`;
  return (
    <Card
      withBorder
      radius="md"
      padding="md"
      component={Link}
      to={`/ceremonies/${c.id}`}
      className={props.tone === "archived" ? "ceremony-card is-archived" : "ceremony-card"}
    >
      <Group justify="space-between" wrap="nowrap" gap="md">
        <Text fw={700} lineClamp={1}>
          {label}
        </Text>
      </Group>
    </Card>
  );
}

export function CeremoniesIndexScreen(props: {
  state: "loading" | "error" | "ready";
  error: string | null;
  active: CeremonyIndexRow[];
  archived: CeremonyIndexRow[];
}) {
  if (props.state === "loading") return <PageLoader label="Loading ceremonies..." />;
  if (props.state === "error") return <PageError message={props.error ?? "Failed to load"} />;

  return (
    <Card className="card" component="section">
      <Stack gap="lg">
        <header>
          <Title order={2}>Ceremonies</Title>
          <Text className="muted">Browse current and past ceremonies.</Text>
        </header>

        <Stack gap="sm">
          <Title order={3}>Active</Title>
          {props.active.length === 0 ? (
            <Text className="muted">No active ceremonies yet.</Text>
          ) : (
            <Stack gap="sm">
              {props.active.map((c) => (
                <CeremonyCard key={c.id} ceremony={c} tone="active" />
              ))}
            </Stack>
          )}
        </Stack>

        <Stack gap="sm">
          <Title order={3}>Archived</Title>
          {props.archived.length === 0 ? (
            <Text className="muted">No archived ceremonies yet.</Text>
          ) : (
            <Stack gap="sm">
              {props.archived.map((c) => (
                <CeremonyCard key={c.id} ceremony={c} tone="archived" />
              ))}
            </Stack>
          )}
        </Stack>
      </Stack>
    </Card>
  );
}
