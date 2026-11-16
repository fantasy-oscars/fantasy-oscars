import type { Dispatch, FormEvent, SetStateAction } from "react";
import { Link } from "react-router-dom";
import {
  Box,
  Button,
  Divider,
  Group,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title
} from "@ui";
import { FormStatus } from "@/shared/forms";
import type { ApiResult, FieldErrors } from "@/lib/types";
import type { CircuitCreateForm, CircuitSummary } from "@/orchestration/adminCircuit";
import { circuitStatusLabel } from "@/decisions/admin/circuit";
import { StandardCard } from "@/primitives";
import "@/primitives/baseline.css";

export function AdminCircuitIndexScreen(props: {
  state: "loading" | "error" | "ready";
  error: string | null;
  circuits: CircuitSummary[];
  form: CircuitCreateForm;
  setForm: Dispatch<SetStateAction<CircuitCreateForm>>;
  fieldErrors: FieldErrors;
  onEditField: (name: string) => void;
  creating: boolean;
  status: ApiResult | null;
  onCreate: () => void;
}) {
  const { state, error, circuits, form, setForm, fieldErrors, onEditField } = props;
  const canCreate = form.code.trim() !== "" && form.name.trim() !== "" && !props.creating;

  if (state === "loading")
    return (
      <Stack component="section" gap="md" role="status" aria-label="Loading Circuits">
        <Skeleton height="var(--fo-font-size-hero-title)" width="28%" />
        <Skeleton height="var(--fo-font-size-sm)" width="62%" />
        <Skeleton height="120px" width="100%" />
      </Stack>
    );
  if (state === "error")
    return (
      <Box className="status status-error">{error ?? "Unable to load Circuits"}</Box>
    );

  function submit(e: FormEvent) {
    e.preventDefault();
    if (canCreate) props.onCreate();
  }

  return (
    <Stack component="section" gap="md">
      <Box component="header" className="admin-page-header">
        <Title order={2} className="baseline-textHeroTitle">
          Circuits
        </Title>
        <Text className="baseline-textBody" c="dimmed">
          A Circuit is a season-long competition across several ceremonies; players see it
          as a Season. You choose its ceremonies, events and categories.
        </Text>
      </Box>

      <StandardCard component="form" onSubmit={submit} aria-label="New Circuit">
        <Title order={3} variant="section">
          New Circuit
        </Title>
        <Box className="grid grid-stackOnPhone">
          <TextInput
            label="Name"
            value={form.name}
            onChange={(e) => {
              const v = e.currentTarget.value;
              onEditField("name");
              setForm((p) => ({ ...p, name: v }));
            }}
            error={fieldErrors.name}
          />
          <TextInput
            label="Code"
            description="Lowercase letters, numbers and dashes."
            value={form.code}
            onChange={(e) => {
              const v = e.currentTarget.value;
              onEditField("code");
              setForm((p) => ({ ...p, code: v }));
            }}
            error={fieldErrors.code}
          />
          <TextInput
            label="Opens on"
            type="date"
            value={form.opensOn}
            onChange={(e) => {
              const v = e.currentTarget.value;
              onEditField("opensOn");
              setForm((p) => ({ ...p, opensOn: v }));
            }}
            error={fieldErrors.opensOn}
          />
        </Box>
        <Group className="inline-actions" mt="sm" wrap="wrap">
          <Button type="submit" disabled={!canCreate}>
            {props.creating ? "Creating..." : "Create Circuit"}
          </Button>
        </Group>
        <FormStatus loading={props.creating} result={props.status} />
      </StandardCard>

      <Divider />

      <Title order={3} variant="section" className="baseline-textSectionHeader">
        All Circuits
      </Title>

      {circuits.length === 0 ? (
        <StandardCard>
          <Text className="baseline-textBody" c="dimmed">
            No Circuits exist yet.
          </Text>
        </StandardCard>
      ) : (
        <Stack component="ul" gap="sm" className="fo-listReset">
          {circuits.map((s) => (
            <StandardCard key={s.id} component="li">
              <Group justify="space-between" align="center" wrap="wrap" gap="sm">
                <Box miw="var(--fo-space-0)">
                  <Text
                    fw="var(--fo-font-weight-bold)"
                    component={Link}
                    to={`/admin/circuits/${s.id}`}
                    className="link-plain fo-block"
                    lineClamp={1}
                  >
                    {s.name}
                  </Text>
                  <Text className="baseline-textMeta" c="dimmed">
                    {s.code}
                    {s.opens_on ? ` · opens ${s.opens_on}` : ""}
                  </Text>
                </Box>
                <Box component="span" className="baseline-statusPill">
                  <Text
                    className="baseline-textMeta fo-letterSpacingTracked"
                    fw="var(--fo-font-weight-bold)"
                  >
                    {circuitStatusLabel(s.status)}
                  </Text>
                </Box>
              </Group>
            </StandardCard>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
