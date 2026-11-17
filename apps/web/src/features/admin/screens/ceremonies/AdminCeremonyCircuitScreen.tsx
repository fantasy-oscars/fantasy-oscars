import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Box, Button, Divider, Group, Select, Stack, Text, Title } from "@ui";
import { FormStatus } from "@/shared/forms";
import type { ApiResult } from "@/lib/types";
import type {
  CeremonyCircuitAssociation,
  CeremonyCircuitOption
} from "@/orchestration/adminCircuit";
import { circuitStatusLabel } from "@/decisions/admin/circuit";
import { EmptyState, StandardCard } from "@/primitives";
import { CircuitRowIconButton } from "@/features/admin/ui/circuit/CircuitRowIconButton";
import "@/primitives/baseline.css";

/**
 * The Circuits this ceremony feeds. The ceremony admin only attaches and
 * detaches, at every ceremony status; grouping and order are set in the
 * Circuit editor.
 */
export function AdminCeremonyCircuitScreen(props: {
  state: "loading" | "error" | "ready";
  error: string | null;
  associations: CeremonyCircuitAssociation[];
  circuitOptions: CeremonyCircuitOption[];
  working: boolean;
  associationStatus: ApiResult | null;
  onAssociate: (circuitId: number) => Promise<boolean>;
  onRemove: (circuitId: number) => void;
}) {
  const [circuitId, setCircuitId] = useState<string | null>(null);

  if (props.state === "loading") return null;
  if (props.state === "error")
    return (
      <Box className="status status-error" role="status">
        {props.error ?? "Unable to load Circuits"}
      </Box>
    );

  const associatedIds = new Set(props.associations.map((a) => a.circuit_id));
  const joinable = props.circuitOptions.filter((c) => !associatedIds.has(c.id));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!circuitId) return;
    if (await props.onAssociate(Number(circuitId))) setCircuitId(null);
  }

  return (
    <StandardCard component="section" aria-labelledby="ceremony-circuits-title">
      <Title order={3} variant="section" id="ceremony-circuits-title">
        Circuits
      </Title>
      <Text className="muted">
        The Circuits this ceremony feeds. Group and order it in the Circuit editor.
      </Text>

      {props.associations.length === 0 ? (
        <Box mt="md">
          <EmptyState>Not in any Circuit.</EmptyState>
        </Box>
      ) : (
        <Stack component="ul" gap="sm" mt="md" className="fo-listReset">
          {props.associations.map((a) => (
            <Group
              key={a.circuit_id}
              component="li"
              justify="space-between"
              align="center"
              wrap="nowrap"
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
                  {a.event_is_group ? `${a.event_name} · ` : ""}
                  {circuitStatusLabel(a.circuit_status)}
                </Text>
              </Box>
              <CircuitRowIconButton
                icon="link_off"
                label={`Detach from ${a.circuit_name}`}
                disabled={props.working || a.circuit_status === "ARCHIVED"}
                onClick={() => props.onRemove(a.circuit_id)}
              />
            </Group>
          ))}
        </Stack>
      )}

      <FormStatus loading={props.working} result={props.associationStatus} />

      <Divider my="md" />

      <Box component="form" onSubmit={submit} aria-label="Attach to a Circuit">
        <Group align="end" wrap="wrap" gap="sm">
          <Box flex={1} miw="var(--fo-layout-fieldMin-md)">
            <Select
              label="Attach to a Circuit"
              placeholder={joinable.length ? "Choose a Circuit" : "No Circuits to join"}
              value={circuitId}
              onChange={setCircuitId}
              disabled={props.working || joinable.length === 0}
              data={joinable.map((c) => ({ value: String(c.id), label: c.name }))}
            />
          </Box>
          <Button type="submit" disabled={props.working || !circuitId}>
            Attach
          </Button>
        </Group>
      </Box>
    </StandardCard>
  );
}
