import { Link } from "react-router-dom";
import { Box, Button, Group, Skeleton, Stack, Text, Title } from "@ui";
import { FormStatus } from "@/shared/forms";
import { PageError } from "@/shared/page-state";
import type { ApiResult } from "@/lib/types";
import type {
  CircuitCategoryTemplate,
  CircuitDetail,
  MissingCeremonyDates
} from "@/orchestration/adminCircuit";
import {
  canActivateCircuit,
  circuitStatusLabel,
  describeMissingDates,
  isCircuitEditable,
  unassociatedCeremonies,
  type MappingChoices
} from "@/decisions/admin/circuit";
import { StandardCard } from "@/primitives";
import {
  CircuitCeremoniesCard,
  type CircuitCeremonyActions
} from "@/features/admin/ui/circuit/CircuitCeremoniesCard";
import {
  CircuitCategoriesCard,
  type CircuitCategoryActions
} from "@/features/admin/ui/circuit/CircuitCategoriesCard";
import {
  CircuitMappingsCard,
  type CircuitMappingActions
} from "@/features/admin/ui/circuit/CircuitMappingsCard";
import { CircuitScheduleCard } from "@/features/admin/ui/circuit/CircuitScheduleCard";
import "@/primitives/baseline.css";

function MissingDatesNotice(props: { title: string; missing: MissingCeremonyDates[] }) {
  return (
    <Box className="status status-warning" role="status">
      <Stack gap="var(--fo-space-4)">
        <Text fw="var(--fo-font-weight-bold)">{props.title}</Text>
        <Stack component="ul" gap="var(--fo-space-2)" className="fo-listReset">
          {describeMissingDates(props.missing).map((line, idx) => (
            <Text key={props.missing[idx]?.ceremony_id ?? idx} component="li">
              {line}
            </Text>
          ))}
        </Stack>
        <Text className="muted" size="sm">
          Set the dates on each ceremony&apos;s admin page.
        </Text>
      </Stack>
    </Box>
  );
}

export function AdminCircuitDetailScreen(props: {
  state: "loading" | "error" | "ready";
  error: string | null;
  detail: CircuitDetail | null;
  ceremonies: Array<{ id: number; name: string | null; code: string | null }>;
  templates: CircuitCategoryTemplate[];
  mappingChoices: MappingChoices;
  working: boolean;
  status: ApiResult | null;
  activationMissing: MissingCeremonyDates[] | null;
  ceremonyActions: CircuitCeremonyActions;
  categoryActions: CircuitCategoryActions;
  mappingActions: CircuitMappingActions;
  onActivate: () => void;
}) {
  const { state, error, detail, working, activationMissing } = props;

  if (state === "loading")
    return (
      <Stack gap="md" role="status" aria-label="Loading Circuit">
        <Skeleton height="var(--fo-font-size-hero-title)" width="32%" />
        <Skeleton height="160px" width="100%" />
        <Skeleton height="160px" width="100%" />
      </Stack>
    );
  if (state === "error" || !detail)
    return <PageError message={error ?? "Unable to load the Circuit"} />;

  const { circuit } = detail;
  const editable = isCircuitEditable(circuit.status);
  const disabled = working || !editable;
  const addable = unassociatedCeremonies(
    props.ceremonies,
    detail.ceremonies.map((c) => c.ceremony_id)
  );

  return (
    <Stack component="section" gap="md">
      <Group justify="space-between" align="end" wrap="wrap" gap="sm">
        <Box miw="var(--fo-space-0)">
          <Title order={2} className="baseline-textHeroTitle">
            {circuit.name}
          </Title>
          <Group gap="xs" align="center" mt="var(--fo-space-4)">
            <Box component="span" className="baseline-statusPill">
              <Text
                className="baseline-textMeta fo-letterSpacingTracked"
                fw="var(--fo-font-weight-bold)"
              >
                {circuitStatusLabel(circuit.status)}
              </Text>
            </Box>
            <Text className="baseline-textMeta" c="dimmed">
              {circuit.code}
              {circuit.opens_on ? ` · opens ${circuit.opens_on}` : ""}
            </Text>
          </Group>
        </Box>
        <Button component={Link} to="/admin/circuits" variant="subtle">
          All Circuits
        </Button>
      </Group>

      {!editable ? (
        <Box className="status status-warning" role="status">
          Archived Circuits are read-only.
        </Box>
      ) : null}

      {canActivateCircuit(circuit.status) ? (
        <StandardCard component="section" aria-labelledby="circuit-activate-title">
          <Group justify="space-between" align="center" wrap="wrap" gap="md">
            <Box flex={1} miw="var(--fo-layout-fieldMin-md)">
              <Title order={3} variant="section" id="circuit-activate-title">
                Activate
              </Title>
              <Text className="muted">
                Activation does not wait for dates. Ceremonies, events, categories and
                mappings stay editable afterwards, with a confirmation step.
              </Text>
            </Box>
            <Button type="button" onClick={props.onActivate} disabled={working}>
              Activate Circuit
            </Button>
          </Group>
        </StandardCard>
      ) : null}

      {activationMissing !== null ? (
        activationMissing.length > 0 ? (
          <MissingDatesNotice
            title="Circuit activated. These ceremonies still need dates:"
            missing={activationMissing}
          />
        ) : (
          <Box className="status status-success" role="status">
            Circuit activated. Every ceremony has both dates.
          </Box>
        )
      ) : detail.readiness.missing_dates.length > 0 ? (
        <MissingDatesNotice
          title="These ceremonies still need dates:"
          missing={detail.readiness.missing_dates}
        />
      ) : null}

      <FormStatus loading={working} result={props.status} />

      <CircuitCeremoniesCard
        events={detail.events}
        ceremonies={detail.ceremonies}
        addableCeremonies={addable}
        disabled={disabled}
        actions={props.ceremonyActions}
      />

      <CircuitCategoriesCard
        categories={detail.categories}
        templates={props.templates}
        disabled={disabled}
        actions={props.categoryActions}
      />

      <CircuitMappingsCard
        ceremonies={detail.ceremonies}
        editions={detail.category_editions}
        categories={detail.categories}
        choices={props.mappingChoices}
        disabled={disabled}
        actions={props.mappingActions}
      />

      <CircuitScheduleCard occasions={detail.occasions} />
    </Stack>
  );
}
