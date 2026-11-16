import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  Box,
  Button,
  Divider,
  Group,
  MultiSelect,
  Select,
  Stack,
  Text,
  TextInput,
  Title
} from "@ui";
import { EmptyState, StandardCard } from "@/primitives";
import {
  ceremoniesByEvent,
  ceremonyLabel,
  CIRCUIT_DATE_LABELS,
  dateOnlyLabel
} from "@/decisions/admin/circuit";
import type { CircuitCeremony, CircuitEvent } from "@/orchestration/adminCircuit";
import { CircuitRenameForm } from "./CircuitRenameForm";
import { CircuitRowIconButton } from "./CircuitRowIconButton";

/** Select value for "give the ceremony its own event". */
const OWN_EVENT = "own";

export type CircuitCeremonyActions = {
  /** Adds a ceremony or moves it into an event; null gives it its own event. */
  place: (ceremonyId: number, circuitEventId: number | null) => Promise<boolean>;
  remove: (ceremonyId: number) => void;
  createEvent: (name: string, ceremonyIds: number[]) => Promise<boolean>;
  renameEvent: (eventId: number, name: string) => Promise<boolean>;
  moveEvent: (eventId: number, delta: -1 | 1) => void;
  ungroupEvent: (eventId: number) => void;
};

/**
 * The Circuit's ceremonies, grouped into events. Each ceremony belongs to
 * exactly one event; leagues enable and weight whole events.
 */
export function CircuitCeremoniesCard(props: {
  events: CircuitEvent[];
  ceremonies: CircuitCeremony[];
  addableCeremonies: Array<{ id: number; name: string | null; code: string | null }>;
  disabled: boolean;
  actions: CircuitCeremonyActions;
}) {
  const { events, ceremonies, addableCeremonies, disabled, actions } = props;
  const [ceremonyId, setCeremonyId] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const groups = ceremoniesByEvent(events, ceremonies);
  const eventOptions = events.map((e) => ({ value: String(e.id), label: e.name }));

  async function submitAdd(e: FormEvent) {
    e.preventDefault();
    if (!ceremonyId) return;
    const ok = await actions.place(Number(ceremonyId), eventId ? Number(eventId) : null);
    if (ok) {
      setCeremonyId(null);
      setEventId(null);
    }
  }

  async function submitGroup(e: FormEvent) {
    e.preventDefault();
    if (!groupName.trim() || groupIds.length === 0) return;
    const ok = await actions.createEvent(groupName, groupIds.map(Number));
    if (ok) {
      setGroupName("");
      setGroupIds([]);
    }
  }

  return (
    <StandardCard component="section" aria-labelledby="circuit-ceremonies-title">
      <Title order={3} variant="section" id="circuit-ceremonies-title">
        Ceremonies
      </Title>
      <Text className="muted">
        Add any ceremony. Each one belongs to one event, and leagues enable and weight
        whole events; group ceremonies that should count as one. The same association is
        shown on the ceremony&apos;s admin page.
      </Text>

      {groups.length === 0 ? (
        <Box mt="md">
          <EmptyState>No ceremonies yet.</EmptyState>
        </Box>
      ) : (
        <Stack gap="md" mt="md">
          {groups.map(({ event, ceremonies: rows }, idx) => (
            <Box key={event.id} role="group" aria-label={`Event: ${event.name}`}>
              {idx > 0 ? <Divider mb="md" /> : null}
              {renaming === event.id ? (
                <CircuitRenameForm
                  label="Event name"
                  initial={event.name}
                  disabled={disabled}
                  onSave={(name) => actions.renameEvent(event.id, name)}
                  onClose={() => setRenaming(null)}
                />
              ) : (
                <Group justify="space-between" align="center" wrap="wrap" gap="xs">
                  <Box flex={1} miw="var(--fo-layout-fieldMin-lg)">
                    <Title order={4} variant="section">
                      {event.name}
                    </Title>
                  </Box>
                  <Group gap="xs" wrap="nowrap" ml="auto">
                    <CircuitRowIconButton
                      icon="edit"
                      label={`Rename ${event.name}`}
                      disabled={disabled}
                      onClick={() => setRenaming(event.id)}
                    />
                    <CircuitRowIconButton
                      icon="arrow_upward"
                      label={`Move ${event.name} up`}
                      disabled={disabled || idx === 0}
                      onClick={() => actions.moveEvent(event.id, -1)}
                    />
                    <CircuitRowIconButton
                      icon="arrow_downward"
                      label={`Move ${event.name} down`}
                      disabled={disabled || idx === groups.length - 1}
                      onClick={() => actions.moveEvent(event.id, 1)}
                    />
                    {rows.length > 1 ? (
                      <CircuitRowIconButton
                        icon="call_split"
                        label={`Ungroup ${event.name}`}
                        disabled={disabled}
                        onClick={() => actions.ungroupEvent(event.id)}
                      />
                    ) : null}
                  </Group>
                </Group>
              )}
              <Stack component="ul" gap="sm" mt="sm" className="fo-listReset">
                {rows.map((c) => (
                  <Group
                    key={c.ceremony_id}
                    component="li"
                    justify="space-between"
                    align="center"
                    wrap="wrap"
                    gap="sm"
                  >
                    <Box miw="var(--fo-space-0)" flex={1}>
                      <Text
                        component={Link}
                        to={`/admin/ceremonies/${c.ceremony_id}/overview`}
                        className="link-plain fo-block"
                        fw="var(--fo-font-weight-bold)"
                      >
                        {ceremonyLabel(c)}
                      </Text>
                      <Text className="muted" size="sm">
                        {CIRCUIT_DATE_LABELS.nominations_on}:{" "}
                        {dateOnlyLabel(c.nominations_on)} ·{" "}
                        {CIRCUIT_DATE_LABELS.results_on}: {dateOnlyLabel(c.results_on)}
                      </Text>
                    </Box>
                    <Group gap="xs" wrap="nowrap" align="center" maw="100%">
                      <Box
                        flex={1}
                        miw="var(--fo-space-0)"
                        w="var(--fo-layout-fieldMin-md)"
                      >
                        <Select
                          aria-label={`Event for ${ceremonyLabel(c)}`}
                          value={String(c.circuit_event_id)}
                          allowDeselect={false}
                          disabled={disabled}
                          onChange={(v) => {
                            if (v === null || v === String(c.circuit_event_id)) return;
                            void actions.place(
                              c.ceremony_id,
                              v === OWN_EVENT ? null : Number(v)
                            );
                          }}
                          data={[
                            ...eventOptions,
                            ...(rows.length > 1
                              ? [{ value: OWN_EVENT, label: "Its own event" }]
                              : [])
                          ]}
                        />
                      </Box>
                      <CircuitRowIconButton
                        icon="link_off"
                        label={`Remove ${ceremonyLabel(c)}`}
                        disabled={disabled}
                        onClick={() => actions.remove(c.ceremony_id)}
                      />
                    </Group>
                  </Group>
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}

      <Divider my="md" />

      <Box component="form" onSubmit={submitAdd} aria-label="Add a ceremony">
        <Title order={4} variant="section">
          Add a ceremony
        </Title>
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
            placeholder="Its own event"
            description="Leave empty to give the ceremony its own event."
            value={eventId}
            onChange={setEventId}
            clearable
            disabled={disabled || events.length === 0}
            data={eventOptions}
          />
        </Box>
        <Group mt="sm" wrap="wrap">
          <Button type="submit" disabled={disabled || !ceremonyId}>
            Add ceremony
          </Button>
        </Group>
      </Box>

      {ceremonies.length > 1 ? (
        <>
          <Divider my="md" />
          <Box
            component="form"
            onSubmit={submitGroup}
            aria-label="Group ceremonies into an event"
          >
            <Title order={4} variant="section">
              Group ceremonies into an event
            </Title>
            <Box className="grid grid-stackOnPhone">
              <TextInput
                label="New event name"
                value={groupName}
                onChange={(e) => setGroupName(e.currentTarget.value)}
                disabled={disabled}
              />
              <MultiSelect
                label="Ceremonies in the event"
                placeholder={groupIds.length ? undefined : "Choose ceremonies"}
                value={groupIds}
                onChange={setGroupIds}
                disabled={disabled}
                data={ceremonies.map((c) => ({
                  value: String(c.ceremony_id),
                  label: ceremonyLabel(c)
                }))}
              />
            </Box>
            <Group mt="sm" wrap="wrap">
              <Button
                type="submit"
                disabled={disabled || !groupName.trim() || groupIds.length === 0}
              >
                Create event
              </Button>
            </Group>
          </Box>
        </>
      ) : null}
    </StandardCard>
  );
}
