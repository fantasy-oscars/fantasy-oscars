import { Link } from "react-router-dom";
import { Box, Button, Card, Group, Stack, Text, Title } from "@mantine/core";
import { FormStatus } from "../../../ui/forms";
import { PageLoader } from "../../../ui/page-state";
import type { ApiResult } from "../../../lib/types";
import type { CeremonyOption } from "../../../orchestration/adminCeremonies";

export function AdminCeremoniesIndexScreen(props: {
  state: "loading" | "error" | "ready";
  error: string | null;
  ceremonies: CeremonyOption[];
  creating: boolean;
  workingId: number | null;
  status: ApiResult | null;
  onCreate: () => void;
  onDelete: (id: number) => void;
}) {
  const { state, error, ceremonies, creating, workingId, status, onCreate, onDelete } =
    props;

  if (state === "loading") return <PageLoader label="Loading ceremonies..." />;
  if (state === "error")
    return (
      <Box className="status status-error">{error ?? "Unable to load ceremonies"}</Box>
    );

  return (
    <Card className="card" component="section">
      <Group
        className="header-with-controls"
        justify="space-between"
        align="start"
        wrap="wrap"
      >
        <Box>
          <Title order={2}>Ceremonies</Title>
          <Text className="muted">
            Create, edit, publish, lock, and archive ceremonies.
          </Text>
        </Box>
        <Group className="inline-actions" wrap="wrap">
          <Button type="button" onClick={onCreate} disabled={creating}>
            {creating ? "Creating..." : "New ceremony"}
          </Button>
        </Group>
      </Group>

      <FormStatus loading={creating || workingId !== null} result={status} />

      {ceremonies.length === 0 ? (
        <Card className="empty-state">
          <Text fw={700}>No ceremonies yet.</Text>
          <Text className="muted" mt="xs">
            Create one to begin setting up nominees, publishing, and winners.
          </Text>
        </Card>
      ) : (
        <Stack className="list">
          {ceremonies.map((c) => (
            <Box key={c.id} className="list-row">
              <Box>
                <Group className="pill-list" wrap="wrap">
                  <Box component="span" className="pill">
                    ID {c.id}
                  </Box>
                  {c.status ? (
                    <Box component="span" className="pill">
                      {c.status}
                    </Box>
                  ) : null}
                  {c.code ? (
                    <Box component="span" className="pill">
                      {c.code}
                    </Box>
                  ) : (
                    <Box component="span" className="pill muted">
                      (no code)
                    </Box>
                  )}
                </Group>
                <Text className="muted">
                  {c.name || "(Unnamed)"}{" "}
                  {c.starts_at ? `• ${new Date(c.starts_at).toLocaleString()}` : ""}
                </Text>
              </Box>
              <Group className="pill-actions" wrap="wrap">
                <Button
                  component={Link}
                  to={`/admin/ceremonies/${c.id}/overview`}
                  variant="subtle"
                >
                  Open
                </Button>
                <Button
                  type="button"
                  className="danger"
                  onClick={() => onDelete(c.id)}
                  disabled={workingId === c.id}
                  title="Delete is only allowed for draft ceremonies with no dependent data."
                >
                  {workingId === c.id ? "Deleting..." : "Delete"}
                </Button>
              </Group>
            </Box>
          ))}
        </Stack>
      )}
    </Card>
  );
}
