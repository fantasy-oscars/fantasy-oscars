import type { Dispatch, SetStateAction } from "react";
import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Group,
  Stack,
  Text,
  TextInput,
  Tooltip,
  Title,
  UnstyledButton
} from "@ui";
import { FormStatus } from "../../../ui/forms";
import { PageError, PageLoader } from "../../../ui/page-state";
import type { ApiResult } from "../../../lib/types";
import { StandardCard } from "../../../primitives";
import "../../../primitives/baseline.css";

const INFO_ICON = String.fromCharCode(0xe88e);

export function AdminCeremoniesOverviewScreen(props: {
  loading: boolean;
  saving: boolean;
  loadError: string | null;
  status: ApiResult | null;
  ceremony: {
    id: number;
    status: "DRAFT" | "PUBLISHED" | "LOCKED" | "COMPLETE" | "ARCHIVED";
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
  readOnly: boolean;
  onSave: () => void;
}) {
  const {
    loading,
    saving,
    loadError,
    status,
    ceremony,
    form,
    setForm,
    readOnly,
    onSave
  } = props;

  const [touched, setTouched] = useState({ code: false, name: false });

  const required = useMemo(
    () => ({
      code: form.code.trim().length > 0,
      name: form.name.trim().length > 0
    }),
    [form.code, form.name]
  );
  const isComplete = required.code && required.name;
  const canSave = isComplete && !saving && !readOnly;

  const showCodeError = touched.code && !required.code;
  const showNameError = touched.name && !required.name;

  if (loading && !ceremony) return <PageLoader label="Loading ceremony..." />;
  if (loadError) return <PageError message={loadError} />;
  if (!ceremony) return <PageError message="Ceremony not found" />;

  return (
    <Stack className="stack-lg" mt="md" gap="lg">
      <StandardCard component="section">
        <Group
          className="header-with-controls"
          justify="space-between"
          align="start"
          wrap="wrap"
        >
          <Box>
            <Title order={3}>Initialize ceremony</Title>
            <Text className="muted">
              Give this ceremony a stable identity and scheduled start time.
            </Text>
          </Box>
          <Box>
            <Box component="span" className="status-pill">
              {ceremony.status}
              {ceremony.draft_locked_at ? " · Drafts locked" : ""}
            </Box>
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
      </StandardCard>

      <StandardCard component="section">
        <Group
          className="header-with-controls"
          justify="space-between"
          align="start"
          wrap="wrap"
        >
          <Box>
            <Title order={3}>Foundation details</Title>
          </Box>
          <Tooltip
            withArrow
            multiline
            w="var(--fo-layout-fieldBasis-md)"
            position="bottom-end"
            withinPortal
            events={{ hover: true, focus: true, touch: true }}
            label={
              <Stack gap="sm">
                <Stack gap="var(--fo-space-2)">
                  <Text fw="var(--fo-font-weight-bold)" size="sm">
                    Name
                  </Text>
                  <Text size="sm" c="dimmed">
                    Display name shown to users across drafts, leagues, and results.
                  </Text>
                </Stack>
                <Stack gap="var(--fo-space-2)">
                  <Text fw="var(--fo-font-weight-bold)" size="sm">
                    Ceremony code
                  </Text>
                  <Text size="sm" c="dimmed">
                    Stable identifier used in URLs and internal references. Not shown to
                    users.
                  </Text>
                </Stack>
                <Stack gap="var(--fo-space-2)">
                  <Text fw="var(--fo-font-weight-bold)" size="sm">
                    Ceremony date &amp; time
                  </Text>
                  <Text size="sm" c="dimmed">
                    Scheduled start time. Entered and displayed in your local time. Stored
                    internally in UTC.
                  </Text>
                </Stack>
                <Stack gap="var(--fo-space-2)">
                  <Text fw="var(--fo-font-weight-bold)" size="sm">
                    Draft warning
                  </Text>
                  <Text size="sm" c="dimmed">
                    Controls how many hours before the draft users are notified.
                  </Text>
                </Stack>
              </Stack>
            }
          >
            <UnstyledButton
              type="button"
              className="admin-help-icon"
              aria-label="Help: field meanings"
            >
              <Text component="span" className="gicon" aria-hidden="true">
                {INFO_ICON}
              </Text>
            </UnstyledButton>
          </Tooltip>
        </Group>

        {readOnly ? (
          <Box className="status status-warning" role="status">
            Archived ceremonies are read-only.
          </Box>
        ) : null}

        <Box className="grid">
          <TextInput
            label="Name"
            value={form.name}
            onChange={(e) => {
              const v = e.currentTarget.value;
              setForm((p) => ({ ...p, name: v }));
            }}
            onBlur={() => setTouched((p) => ({ ...p, name: true }))}
            disabled={readOnly}
            error={showNameError ? "Name is required." : null}
          />
          <TextInput
            label="Ceremony code"
            value={form.code}
            onChange={(e) => {
              const v = e.currentTarget.value;
              setForm((p) => ({ ...p, code: v }));
            }}
            onBlur={() => setTouched((p) => ({ ...p, code: true }))}
            disabled={readOnly}
            error={showCodeError ? "Ceremony code is required." : null}
          />
          <TextInput
            label="Ceremony date & time"
            type="datetime-local"
            value={form.startsAtLocal}
            onChange={(e) => {
              const v = e.currentTarget.value;
              setForm((p) => ({ ...p, startsAtLocal: v }));
            }}
            disabled={readOnly}
          />
          <TextInput
            label="Draft warning (hours)"
            type="number"
            min={0}
            value={form.warningHours}
            onChange={(e) => {
              const v = e.currentTarget.value;
              setForm((p) => ({ ...p, warningHours: v }));
            }}
            disabled={readOnly}
          />
        </Box>

        <Group className="inline-actions" mt="sm" wrap="wrap">
          <Button type="button" onClick={onSave} disabled={!canSave}>
            {saving ? "Saving..." : "Save initialization"}
          </Button>
        </Group>

        <FormStatus loading={saving} result={status} />
      </StandardCard>
    </Stack>
  );
}
