import { useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { Link } from "react-router-dom";
import { Box, Button, Divider, Group, Select, Stack, Text, TextInput, Title } from "@ui";
import { FormStatus } from "@/shared/forms";
import type { ApiResult, FieldErrors } from "@/lib/types";
import type {
  CeremonyDatesForm,
  CeremonyCircuitAssociation,
  CeremonyCircuitOption
} from "@/orchestration/adminCircuit";
import { CIRCUIT_DATE_LABELS, circuitStatusLabel } from "@/decisions/admin/circuit";
import { EmptyState, StandardCard } from "@/primitives";
import { CircuitRowIconButton } from "@/features/admin/ui/circuit/CircuitRowIconButton";
import "@/primitives/baseline.css";

/** Select value for "give the ceremony its own event". */
const OWN_EVENT = "own";

/**
 * Circuit dates and associations on the ceremony admin. Both stay editable at
 * every ceremony status, archived included.
 */
export function AdminCeremonyCircuitScreen(props: {
  state: "loading" | "error" | "ready";
  error: string | null;
  datesForm: CeremonyDatesForm;
  setDatesForm: Dispatch<SetStateAction<CeremonyDatesForm>>;
  fieldErrors: FieldErrors;
  onEditField: (name: string) => void;
  savingDates: boolean;
  datesStatus: ApiResult | null;
  onSaveDates: () => void;
  associations: CeremonyCircuitAssociation[];
  circuitOptions: CeremonyCircuitOption[];
  working: boolean;
  associationStatus: ApiResult | null;
  /** Adds this ceremony to a Circuit or moves it; a null event gives it its own. */
  onAssociate: (circuitId: number, circuitEventId: number | null) => Promise<boolean>;
  onRemove: (circuitId: number) => void;
}) {
  const { state, datesForm, setDatesForm, fieldErrors, onEditField } = props;
  const [circuitId, setCircuitId] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);

  if (state === "loading") return null;
  if (state === "error")
    return (
      <Box className="status status-error" role="status">
        {props.error ?? "Unable to load Circuits"}
      </Box>
    );

  const associatedIds = new Set(props.associations.map((a) => a.circuit_id));
  const joinable = props.circuitOptions.filter((c) => !associatedIds.has(c.id));
  const chosen = joinable.find((c) => String(c.id) === circuitId) ?? null;

  function submitDates(e: FormEvent) {
    e.preventDefault();
    props.onSaveDates();
  }

  async function submitAssociation(e: FormEvent) {
    e.preventDefault();
    if (!circuitId) return;
    const ok = await props.onAssociate(
      Number(circuitId),
      eventId ? Number(eventId) : null
    );
    if (ok) {
      setCircuitId(null);
      setEventId(null);
    }
  }

  return (
    <Stack className="stack-lg" gap="lg">
      <StandardCard component="form" onSubmit={submitDates} aria-label="Circuit dates">
        <Title order={3} variant="section">
          Circuit dates
        </Title>
        <Text className="muted">
          The days this ceremony announces nominations and results. Circuit scoring and
          waivers follow them. Editable at any status.
        </Text>
        <Box className="grid grid-stackOnPhone">
          <TextInput
            label={CIRCUIT_DATE_LABELS.nominations_on}
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
            label={CIRCUIT_DATE_LABELS.results_on}
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
        <Group mt="md" wrap="wrap">
          <Button type="submit" disabled={props.savingDates}>
            {props.savingDates ? "Saving..." : "Save dates"}
          </Button>
        </Group>
        <FormStatus loading={props.savingDates} result={props.datesStatus} />
      </StandardCard>

      <StandardCard component="section" aria-labelledby="ceremony-circuits-title">
        <Title order={3} variant="section" id="ceremony-circuits-title">
          Circuits
        </Title>
        <Text className="muted">
          The Circuits this ceremony feeds, and the event it counts as. The same
          association is shown on the Circuit admin page.
        </Text>

        {props.associations.length === 0 ? (
          <Box mt="md">
            <EmptyState>Not in any Circuit.</EmptyState>
          </Box>
        ) : (
          <Stack component="ul" gap="sm" mt="md" className="fo-listReset">
            {props.associations.map((a) => {
              const option = props.circuitOptions.find((c) => c.id === a.circuit_id);
              const locked = props.working || a.circuit_status === "ARCHIVED";
              return (
                <Group
                  key={a.circuit_id}
                  component="li"
                  justify="space-between"
                  align="center"
                  wrap="wrap"
                  gap="sm"
                >
                  <Box miw="var(--fo-space-0)" flex={1}>
                    <Text
                      component={Link}
                      to={`/admin/circuits/${a.circuit_id}`}
                      className="link-plain fo-block"
                      fw="var(--fo-font-weight-bold)"
                    >
                      {a.circuit_name}
                    </Text>
                    <Text className="muted" size="sm">
                      {a.event_name} · {circuitStatusLabel(a.circuit_status)}
                    </Text>
                  </Box>
                  <Group gap="xs" wrap="nowrap" align="center" maw="100%">
                    {option ? (
                      <Box
                        flex={1}
                        miw="var(--fo-space-0)"
                        w="var(--fo-layout-fieldMin-md)"
                      >
                        <Select
                          aria-label={`Event in ${a.circuit_name}`}
                          value={String(a.circuit_event_id)}
                          allowDeselect={false}
                          disabled={locked}
                          onChange={(v) => {
                            if (v === null || v === String(a.circuit_event_id)) return;
                            void props.onAssociate(
                              a.circuit_id,
                              v === OWN_EVENT ? null : Number(v)
                            );
                          }}
                          data={[
                            ...option.events.map((e) => ({
                              value: String(e.id),
                              label: e.name
                            })),
                            { value: OWN_EVENT, label: "Its own event" }
                          ]}
                        />
                      </Box>
                    ) : null}
                    <CircuitRowIconButton
                      icon="link_off"
                      label={`Remove from ${a.circuit_name}`}
                      disabled={locked}
                      onClick={() => props.onRemove(a.circuit_id)}
                    />
                  </Group>
                </Group>
              );
            })}
          </Stack>
        )}

        <FormStatus loading={props.working} result={props.associationStatus} />

        <Divider my="md" />

        <Box component="form" onSubmit={submitAssociation} aria-label="Add to a Circuit">
          <Title order={4} variant="section">
            Add to a Circuit
          </Title>
          <Box className="grid grid-stackOnPhone">
            <Select
              label="Circuit"
              placeholder={joinable.length ? "Choose a Circuit" : "No Circuits to join"}
              value={circuitId}
              onChange={(v) => {
                setCircuitId(v);
                setEventId(null);
              }}
              disabled={props.working || joinable.length === 0}
              data={joinable.map((c) => ({ value: String(c.id), label: c.name }))}
            />
            <Select
              label="Event"
              placeholder="Its own event"
              description="Leave empty to give this ceremony its own event."
              value={eventId}
              onChange={setEventId}
              clearable
              disabled={props.working || !chosen || chosen.events.length === 0}
              data={(chosen?.events ?? []).map((e) => ({
                value: String(e.id),
                label: e.name
              }))}
            />
          </Box>
          <Group mt="sm" wrap="wrap">
            <Button type="submit" disabled={props.working || !circuitId}>
              Add to Circuit
            </Button>
          </Group>
        </Box>
      </StandardCard>
    </Stack>
  );
}
