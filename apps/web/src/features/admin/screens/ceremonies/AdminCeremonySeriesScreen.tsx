import { useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { Link } from "react-router-dom";
import { Box, Button, Divider, Group, Select, Stack, Text, TextInput, Title } from "@ui";
import { FormStatus } from "@/shared/forms";
import type { ApiResult, FieldErrors } from "@/lib/types";
import type {
  CeremonyDatesForm,
  CeremonySeriesAssociation,
  CeremonySeriesOption
} from "@/orchestration/adminSeries";
import { SERIES_DATE_LABELS, seriesStatusLabel } from "@/decisions/admin/series";
import { StandardCard } from "@/primitives";
import "@/primitives/baseline.css";

/**
 * Series dates and associations on the ceremony admin. Both stay editable at
 * every ceremony status, archived included.
 */
export function AdminCeremonySeriesScreen(props: {
  state: "loading" | "error" | "ready";
  error: string | null;
  datesForm: CeremonyDatesForm;
  setDatesForm: Dispatch<SetStateAction<CeremonyDatesForm>>;
  fieldErrors: FieldErrors;
  onEditField: (name: string) => void;
  savingDates: boolean;
  datesStatus: ApiResult | null;
  onSaveDates: () => void;
  associations: CeremonySeriesAssociation[];
  seriesOptions: CeremonySeriesOption[];
  working: boolean;
  seriesStatus: ApiResult | null;
  onAssociate: (seriesId: number, seriesEventId: number) => Promise<boolean>;
  onRemove: (seriesId: number) => void;
}) {
  const { state, datesForm, setDatesForm, fieldErrors, onEditField } = props;
  const [seriesId, setSeriesId] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);

  if (state === "loading") return null;
  if (state === "error")
    return (
      <Box className="status status-error" role="status">
        {props.error ?? "Unable to load Series"}
      </Box>
    );

  const associatedIds = new Set(props.associations.map((a) => a.series_id));
  const joinable = props.seriesOptions.filter((s) => !associatedIds.has(s.id));
  const chosen = joinable.find((s) => String(s.id) === seriesId) ?? null;

  function submitDates(e: FormEvent) {
    e.preventDefault();
    props.onSaveDates();
  }

  async function submitAssociation(e: FormEvent) {
    e.preventDefault();
    if (!seriesId || !eventId) return;
    const ok = await props.onAssociate(Number(seriesId), Number(eventId));
    if (ok) {
      setSeriesId(null);
      setEventId(null);
    }
  }

  return (
    <Stack className="stack-lg" gap="lg">
      <StandardCard component="form" onSubmit={submitDates} aria-label="Series dates">
        <Title order={3} variant="section">
          Series dates
        </Title>
        <Text className="muted">
          The days this ceremony announces nominations and results. Series scoring and
          waivers follow them. Editable at any status.
        </Text>
        <Box className="grid grid-stackOnPhone">
          <TextInput
            label={SERIES_DATE_LABELS.nominations_on}
            type="date"
            value={datesForm.nominationsOn}
            onChange={(e) => {
              const v = e.currentTarget.value;
              onEditField("nominationsOn");
              setDatesForm((p) => ({ ...p, nominationsOn: v }));
            }}
            error={fieldErrors.nominationsOn}
          />
          <TextInput
            label={SERIES_DATE_LABELS.results_on}
            type="date"
            value={datesForm.resultsOn}
            onChange={(e) => {
              const v = e.currentTarget.value;
              onEditField("resultsOn");
              setDatesForm((p) => ({ ...p, resultsOn: v }));
            }}
            error={fieldErrors.resultsOn}
          />
        </Box>
        <Group className="inline-actions" mt="sm" wrap="wrap">
          <Button type="submit" disabled={props.savingDates}>
            {props.savingDates ? "Saving..." : "Save dates"}
          </Button>
        </Group>
        <FormStatus loading={props.savingDates} result={props.datesStatus} />
      </StandardCard>

      <StandardCard component="section" aria-labelledby="ceremony-series-title">
        <Title order={3} variant="section" id="ceremony-series-title">
          Series
        </Title>
        <Text className="muted">
          The Series this ceremony feeds, and the event it counts as. The same association
          is shown on the Series admin page.
        </Text>

        {props.associations.length === 0 ? (
          <Text className="muted" size="sm" mt="sm">
            Not in any Series.
          </Text>
        ) : (
          <Stack component="ul" gap="xs" mt="sm" className="fo-listReset">
            {props.associations.map((a) => (
              <Group
                key={a.series_id}
                component="li"
                justify="space-between"
                align="center"
                wrap="wrap"
                gap="xs"
              >
                <Box miw="var(--fo-space-0)">
                  <Text
                    component={Link}
                    to={`/admin/series/${a.series_id}`}
                    className="link-plain"
                  >
                    {a.series_name}
                  </Text>
                  <Text className="muted" size="sm">
                    {a.event_name} · {seriesStatusLabel(a.series_status)}
                  </Text>
                </Box>
                <Button
                  type="button"
                  variant="subtle"
                  disabled={props.working || a.series_status === "ARCHIVED"}
                  aria-label={`Remove from ${a.series_name}`}
                  onClick={() => props.onRemove(a.series_id)}
                >
                  Remove
                </Button>
              </Group>
            ))}
          </Stack>
        )}

        <FormStatus loading={props.working} result={props.seriesStatus} />

        <Divider my="sm" />

        <Box component="form" onSubmit={submitAssociation} aria-label="Add to a Series">
          <Box className="grid grid-stackOnPhone">
            <Select
              label="Series"
              placeholder={joinable.length ? "Choose a Series" : "No Series to join"}
              value={seriesId}
              onChange={(v) => {
                setSeriesId(v);
                setEventId(null);
              }}
              disabled={props.working || joinable.length === 0}
              data={joinable.map((s) => ({ value: String(s.id), label: s.name }))}
            />
            <Select
              label="Event"
              placeholder="Choose an event"
              value={eventId}
              onChange={setEventId}
              disabled={props.working || !chosen}
              data={(chosen?.events ?? []).map((e) => ({
                value: String(e.id),
                label: e.name
              }))}
            />
          </Box>
          <Group className="inline-actions" mt="sm" wrap="wrap">
            <Button type="submit" disabled={props.working || !seriesId || !eventId}>
              Add to Series
            </Button>
          </Group>
        </Box>
      </StandardCard>
    </Stack>
  );
}
