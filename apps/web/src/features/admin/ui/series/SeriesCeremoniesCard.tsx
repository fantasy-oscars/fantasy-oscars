import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Box, Button, Divider, Group, Select, Stack, Text, Title } from "@ui";
import { StandardCard } from "@/primitives";
import {
  ceremonyLabel,
  dateOnlyLabel,
  SERIES_DATE_LABELS
} from "@/decisions/admin/series";
import type { SeriesCeremony, SeriesEvent } from "@/orchestration/adminSeries";

/** The ceremonies associated with each event of a Series, and a form to add one. */
export function SeriesCeremoniesCard(props: {
  events: SeriesEvent[];
  ceremonies: SeriesCeremony[];
  addableCeremonies: Array<{ id: number; name: string | null; code: string | null }>;
  disabled: boolean;
  onAdd: (ceremonyId: number, seriesEventId: number) => Promise<boolean>;
  onRemove: (ceremonyId: number) => void;
}) {
  const { events, ceremonies, addableCeremonies, disabled } = props;
  const [ceremonyId, setCeremonyId] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ceremonyId || !eventId) return;
    const ok = await props.onAdd(Number(ceremonyId), Number(eventId));
    if (ok) setCeremonyId(null);
  }

  return (
    <StandardCard component="section" aria-labelledby="series-ceremonies-title">
      <Title order={3} variant="section" id="series-ceremonies-title">
        Ceremonies
      </Title>
      <Text className="muted">
        Each ceremony belongs to one event. The same association is shown on the
        ceremony&apos;s admin page.
      </Text>

      <Stack gap="sm" mt="sm">
        {events.map((event, idx) => {
          const rows = ceremonies.filter((c) => c.series_event_id === event.id);
          return (
            <Box key={event.id}>
              {idx > 0 ? <Divider mb="sm" /> : null}
              <Text fw="var(--fo-font-weight-bold)">{event.name}</Text>
              {rows.length === 0 ? (
                <Text className="muted" size="sm">
                  No ceremony yet.
                </Text>
              ) : (
                <Stack component="ul" gap="xs" className="fo-listReset">
                  {rows.map((c) => (
                    <Group
                      key={c.ceremony_id}
                      component="li"
                      justify="space-between"
                      align="center"
                      wrap="wrap"
                      gap="xs"
                    >
                      <Box miw="var(--fo-space-0)">
                        <Text
                          component={Link}
                          to={`/admin/ceremonies/${c.ceremony_id}/overview`}
                          className="link-plain"
                        >
                          {ceremonyLabel(c)}
                        </Text>
                        <Text className="muted" size="sm">
                          {SERIES_DATE_LABELS.nominations_on}:{" "}
                          {dateOnlyLabel(c.nominations_on)} ·{" "}
                          {SERIES_DATE_LABELS.results_on}: {dateOnlyLabel(c.results_on)}
                        </Text>
                      </Box>
                      <Button
                        type="button"
                        variant="subtle"
                        disabled={disabled}
                        aria-label={`Remove ${ceremonyLabel(c)}`}
                        onClick={() => props.onRemove(c.ceremony_id)}
                      >
                        Remove
                      </Button>
                    </Group>
                  ))}
                </Stack>
              )}
            </Box>
          );
        })}
      </Stack>

      <Divider my="sm" />

      <Box component="form" onSubmit={submit} aria-label="Add a ceremony">
        <Box className="grid grid-stackOnPhone">
          <Select
            label="Ceremony"
            placeholder="Choose a ceremony"
            value={ceremonyId}
            onChange={setCeremonyId}
            searchable
            disabled={disabled}
            nothingFoundMessage="No other ceremonies"
            data={addableCeremonies.map((c) => ({
              value: String(c.id),
              label: c.name || c.code || `Ceremony ${c.id}`
            }))}
          />
          <Select
            label="Event"
            placeholder="Choose an event"
            value={eventId}
            onChange={setEventId}
            disabled={disabled}
            data={events.map((e) => ({ value: String(e.id), label: e.name }))}
          />
        </Box>
        <Group className="inline-actions" mt="sm" wrap="wrap">
          <Button type="submit" disabled={disabled || !ceremonyId || !eventId}>
            Add ceremony
          </Button>
        </Group>
      </Box>
    </StandardCard>
  );
}
