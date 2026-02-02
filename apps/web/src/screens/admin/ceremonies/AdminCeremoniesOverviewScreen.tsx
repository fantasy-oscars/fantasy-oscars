import { Link } from "react-router-dom";
import type { Dispatch, SetStateAction } from "react";
import { Box, Button, Card, Group, Stack, Text, TextInput, Title } from "@mantine/core";
import { FormStatus } from "../../../ui/forms";
import { PageError, PageLoader } from "../../../ui/page-state";
import type { ApiResult } from "../../../lib/types";

export function AdminCeremoniesOverviewScreen(props: {
  loading: boolean;
  saving: boolean;
  publishing: boolean;
  loadError: string | null;
  status: ApiResult | null;
  ceremony: {
    id: number;
    status: "DRAFT" | "PUBLISHED" | "LOCKED" | "ARCHIVED";
    code: string | null;
    name: string | null;
    starts_at: string | null;
    draft_locked_at: string | null;
    draft_warning_hours: number;
    published_at: string | null;
    archived_at: string | null;
  } | null;
  stats: { nominees_total: number; winners_total: number } | null;
  form: { code: string; name: string; startsAtLocal: string; warningHours: string };
  setForm: Dispatch<
    SetStateAction<{
      code: string;
      name: string;
      startsAtLocal: string;
      warningHours: string;
    }>
  >;
  completeness: { ok: boolean; label: string };
  readOnly: boolean;
  onSave: () => void;
  onPublish: () => void;
}) {
  const {
    loading,
    saving,
    publishing,
    loadError,
    status,
    ceremony,
    stats,
    form,
    setForm,
    completeness,
    readOnly,
    onSave,
    onPublish
  } = props;

  if (loading && !ceremony) return <PageLoader label="Loading ceremony..." />;
  if (loadError) return <PageError message={loadError} />;
  if (!ceremony) return <PageError message="Ceremony not found" />;

  return (
    <Stack className="stack-lg" mt="md" gap="lg">
      <Card className="card nested" component="section">
        <Group
          className="header-with-controls"
          justify="space-between"
          align="start"
          wrap="wrap"
        >
          <Box>
            <Title order={3}>Overview</Title>
            <Text className="muted">Configure the ceremony lifecycle and key dates.</Text>
          </Box>
          <Group className="pill-list" wrap="wrap">
            <Box
              component="span"
              className={`pill ${ceremony.status === "DRAFT" ? "muted" : ""}`}
            >
              {ceremony.status}
            </Box>
            {ceremony.draft_locked_at ? (
              <Box component="span" className="pill">
                Drafts locked
              </Box>
            ) : null}
          </Group>
        </Group>

        <Group className="pill-list" wrap="wrap" mt="xs">
          <Box component="span" className="pill">
            Nominees: {stats?.nominees_total ?? 0}
          </Box>
          <Box component="span" className="pill">
            Winners: {stats?.winners_total ?? 0}
          </Box>
          <Box component="span" className="pill">
            {completeness.label}
          </Box>
        </Group>

        {ceremony.published_at ? (
          <Text className="muted">
            Published at {new Date(ceremony.published_at).toLocaleString()}
          </Text>
        ) : null}
        {ceremony.archived_at ? (
          <Text className="muted">
            Archived at {new Date(ceremony.archived_at).toLocaleString()}
          </Text>
        ) : null}
      </Card>

      <Card className="card nested" component="section">
        <Group
          className="header-with-controls"
          justify="space-between"
          align="start"
          wrap="wrap"
        >
          <Box>
            <Title order={3}>Init</Title>
            <Text className="muted">Identity and mechanically relevant dates.</Text>
          </Box>
        </Group>

        {readOnly ? (
          <Box className="status status-warning" role="status">
            Archived ceremonies are read-only.
          </Box>
        ) : null}

        <Box className="grid">
          <TextInput
            label="Code"
            value={form.code}
            onChange={(e) => setForm((p) => ({ ...p, code: e.currentTarget.value }))}
            disabled={readOnly}
            placeholder="Required"
          />
          <TextInput
            label="Name"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.currentTarget.value }))}
            disabled={readOnly}
            placeholder="Required"
          />
          <TextInput
            label="Ceremony at"
            type="datetime-local"
            value={form.startsAtLocal}
            onChange={(e) =>
              setForm((p) => ({ ...p, startsAtLocal: e.currentTarget.value }))
            }
            disabled={readOnly}
          />
          <TextInput
            label="Draft warning (hours before)"
            type="number"
            min={0}
            value={form.warningHours}
            onChange={(e) =>
              setForm((p) => ({ ...p, warningHours: e.currentTarget.value }))
            }
            disabled={readOnly}
          />
        </Box>

        <Group className="inline-actions" mt="sm" wrap="wrap">
          <Button type="button" onClick={onSave} disabled={saving || readOnly}>
            {saving ? "Saving..." : "Save changes"}
          </Button>

          {ceremony.status === "DRAFT" ? (
            <Button
              type="button"
              onClick={onPublish}
              disabled={publishing || !completeness.ok}
              title={
                completeness.ok ? "" : "All categories must have nominees before publish"
              }
            >
              {publishing ? "Publishing..." : "Publish"}
            </Button>
          ) : null}

          <Button
            component={Link}
            to={`/admin/ceremonies/${ceremony.id}/nominees`}
            variant="subtle"
          >
            Manage nominees
          </Button>
          <Button
            component={Link}
            to={`/admin/ceremonies/${ceremony.id}/winners`}
            variant="subtle"
          >
            Enter winners
          </Button>
        </Group>

        {form.code.trim().length === 0 || form.name.trim().length === 0 ? (
          <Box className="status status-warning" role="status">
            Code and name are required before publishing.
          </Box>
        ) : null}

        <FormStatus loading={saving || publishing} result={status} />
      </Card>
    </Stack>
  );
}
