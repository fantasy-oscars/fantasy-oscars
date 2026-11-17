import { Box, Button, Divider, Group, Select, Stack, Text } from "@ui";
import type { ApiResult, CircuitSummary } from "@/lib/types";
import type { SettingsArea } from "@/decisions/fullSeasonSettings";
import { FormStatus } from "@/shared/forms";
import { StandardCard } from "@/primitives";
import { SettingsHeading } from "@/features/circuitLeagues/ui/settings/SettingsHeading";
import {
  SettingsSummaryRows,
  type SummaryRow
} from "@/features/circuitLeagues/ui/settings/SettingsSummaryRows";
import classes from "./SeasonCreate.module.css";

/**
 * Card 2 of Create season for a full awards season: which awards season, then
 * a summary per settings area. The defaults suit most leagues, so Create
 * works straight away; each Edit opens that area's modal.
 */
export function FullSeasonForm(props: {
  openCircuits: CircuitSummary[];
  circuitId: number | null;
  working: boolean;
  status: ApiResult | null;
  /** Changing the awards season put edited events and categories back. */
  discarded: boolean;
  statusLine: string;
  /** Whether the awards season's events and categories loaded. */
  optionsFailed: boolean;
  rows: SummaryRow[];
  onChooseCircuit: (id: number | null) => void;
  onRetryOptions: () => void;
  onOpen: (area: SettingsArea) => void;
  onReset: () => void;
  onSubmit: () => void;
}) {
  const { openCircuits, circuitId, working, status } = props;
  const only = openCircuits.length === 1 ? openCircuits[0]! : null;
  return (
    <StandardCard
      component="form"
      aria-label="Full awards season"
      onSubmit={(e: React.FormEvent) => {
        e.preventDefault();
        if (!working && circuitId) props.onSubmit();
      }}
    >
      <Stack gap="sm">
        {only ? (
          <Box className={classes.awardsRow}>
            <Text
              className={`baseline-textBody ${classes.awardsLabel}`}
              fw="var(--fo-font-weight-semibold)"
            >
              Awards season
            </Text>
            <Text
              className={`baseline-textBody baseline-wrapAnywhere ${classes.awardsValue}`}
            >
              {only.name}
            </Text>
          </Box>
        ) : (
          <Stack gap="var(--fo-space-dense-2)">
            <Select
              label="Awards season"
              value={circuitId ? String(circuitId) : null}
              onChange={(v) => props.onChooseCircuit(v ? Number(v) : null)}
              allowDeselect={false}
              disabled={working}
              data={openCircuits.map((c) => ({ value: String(c.id), label: c.name }))}
            />
            <Text variant="meta" role="status" aria-live="polite">
              {props.discarded
                ? "Event and category settings are back to their defaults for this awards season."
                : ""}
            </Text>
          </Stack>
        )}

        <Divider />

        <SettingsHeading statusLine={props.statusLine} />
        <Text variant="helper">
          The defaults suit most leagues. You can change these until you lock the season.
        </Text>

        {props.optionsFailed ? (
          <Stack gap="xs" align="flex-start">
            <FormStatus
              loading={false}
              result={{
                ok: false,
                message: "Couldn't load this awards season's events and categories."
              }}
            />
            <Button type="button" variant="ghost" onClick={props.onRetryOptions}>
              Try again
            </Button>
          </Stack>
        ) : null}

        <SettingsSummaryRows rows={props.rows} onOpen={props.onOpen} />

        <Group wrap="wrap" justify="flex-start">
          <Button type="submit" variant="primary" disabled={working || !circuitId}>
            {working ? "Creating..." : "Create season"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={props.onReset}
            disabled={working}
          >
            Reset
          </Button>
        </Group>

        <FormStatus loading={working} result={status} />
      </Stack>
    </StandardCard>
  );
}
