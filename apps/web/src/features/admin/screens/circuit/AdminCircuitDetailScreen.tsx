import { Link } from "react-router-dom";
import { Box, Button, Group, Skeleton, Stack, Text, Title } from "@ui";
import { FormStatus } from "@/shared/forms";
import { PageError } from "@/shared/page-state";
import type { ApiResult } from "@/lib/types";
import type {
  CircuitCategoryTemplate,
  CircuitDetail,
  CircuitReadiness,
  MissingCeremonyDates
} from "@/orchestration/adminCircuit";
import {
  canActivateCircuit,
  canPublishCircuit,
  canWithdrawCircuit,
  circuitStatusLabel,
  describeMissingDates,
  isCircuitEditable,
  unassociatedCeremonies
} from "@/decisions/admin/circuit";
import { StandardCard } from "@/primitives";
import {
  CircuitCeremoniesTab,
  type CircuitCeremonyActions
} from "@/features/admin/ui/circuit/CircuitCeremoniesTab";
import {
  CircuitCategoriesTab,
  type CircuitCategoryActions
} from "@/features/admin/ui/circuit/CircuitCategoriesTab";
import { CircuitReadinessTab } from "@/features/admin/ui/circuit/CircuitReadinessTab";
import { CircuitScheduleTab } from "@/features/admin/ui/circuit/CircuitScheduleTab";
import {
  CircuitEditorTabs,
  circuitPanelId,
  circuitTabId,
  type CircuitEditorTab
} from "@/features/admin/ui/circuit/CircuitEditorTabs";
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
  readiness: CircuitReadiness | null;
  ceremonies: Array<{ id: number; name: string | null; code: string | null }>;
  templates: CircuitCategoryTemplate[];
  /** Template icon codes a Circuit category's icon can be set to. */
  iconCodes: string[];
  working: boolean;
  status: ApiResult | null;
  activationMissing: MissingCeremonyDates[] | null;
  ceremonyActions: CircuitCeremonyActions;
  categoryActions: CircuitCategoryActions;
  tab: CircuitEditorTab;
  onTabChange: (tab: CircuitEditorTab) => void;
  onPublish: () => void;
  onWithdraw: () => void;
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
        <StandardCard component="section" aria-labelledby="circuit-golive-title">
          <Group justify="space-between" align="center" wrap="wrap" gap="md">
            <Box flex={1} miw="var(--fo-layout-fieldMin-md)">
              <Title order={3} variant="section" id="circuit-golive-title">
                {canWithdrawCircuit(circuit.status)
                  ? "Published"
                  : "Publish and activate"}
              </Title>
              <Text className="muted">
                {canWithdrawCircuit(circuit.status)
                  ? "Players see this Circuit as coming soon and can set up seasons. Their drafts start once you activate it. Withdrawing hides it again, and is refused while any season is set up for it."
                  : "Publishing lets players see this Circuit as coming soon and set up seasons; their drafts start once you activate it. You can also activate it straight away."}
              </Text>
              <Text className="muted">
                Activation does not wait for dates. Ceremonies, groups, categories and
                mappings stay editable afterwards, with a confirmation step.
              </Text>
            </Box>
            <Group gap="sm" wrap="wrap">
              {canPublishCircuit(circuit.status) ? (
                <Button type="button" onClick={props.onPublish} disabled={working}>
                  Publish Circuit
                </Button>
              ) : null}
              {canWithdrawCircuit(circuit.status) ? (
                <Button
                  type="button"
                  variant="default"
                  onClick={props.onWithdraw}
                  disabled={working}
                >
                  Withdraw
                </Button>
              ) : null}
              <Button
                type="button"
                variant={canPublishCircuit(circuit.status) ? "default" : "filled"}
                onClick={props.onActivate}
                disabled={working}
              >
                Activate Circuit
              </Button>
            </Group>
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

      <StandardCard component="section" aria-label="Circuit editor">
        <CircuitEditorTabs value={props.tab} onChange={props.onTabChange} />
        <Box
          role="tabpanel"
          id={circuitPanelId(props.tab)}
          aria-labelledby={circuitTabId(props.tab)}
          mt="md"
        >
          {props.tab === "categories" ? (
            <CircuitCategoriesTab
              categories={detail.categories}
              templates={props.templates}
              iconCodes={props.iconCodes}
              disabled={disabled}
              actions={props.categoryActions}
            />
          ) : props.tab === "ceremonies" ? (
            <CircuitCeremoniesTab
              events={detail.events}
              ceremonies={detail.ceremonies}
              categories={detail.categories}
              editions={detail.category_editions}
              addableCeremonies={addable}
              disabled={disabled}
              actions={props.ceremonyActions}
            />
          ) : props.tab === "readiness" ? (
            <CircuitReadinessTab readiness={props.readiness} />
          ) : (
            <CircuitScheduleTab
              ceremonies={detail.ceremonies}
              occasions={detail.occasions}
              windows={detail.waiver_windows ?? []}
            />
          )}
        </Box>
      </StandardCard>
    </Stack>
  );
}
