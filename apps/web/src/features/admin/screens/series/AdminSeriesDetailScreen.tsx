import { Link } from "react-router-dom";
import { Box, Button, Group, Skeleton, Stack, Text, Title } from "@ui";
import { FormStatus } from "@/shared/forms";
import { PageError } from "@/shared/page-state";
import type { ApiResult } from "@/lib/types";
import type { MissingCeremonyDates, SeriesDetail } from "@/orchestration/adminSeries";
import {
  canActivateSeries,
  describeMissingDates,
  isSeriesEditable,
  seriesStatusLabel,
  unassociatedCeremonies
} from "@/decisions/admin/series";
import { StandardCard } from "@/primitives";
import { SeriesCeremoniesCard } from "@/features/admin/ui/series/SeriesCeremoniesCard";
import { SeriesMappingsCard } from "@/features/admin/ui/series/SeriesMappingsCard";
import { SeriesScheduleCard } from "@/features/admin/ui/series/SeriesScheduleCard";
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

export function AdminSeriesDetailScreen(props: {
  state: "loading" | "error" | "ready";
  error: string | null;
  detail: SeriesDetail | null;
  ceremonies: Array<{ id: number; name: string | null; code: string | null }>;
  working: boolean;
  status: ApiResult | null;
  activationMissing: MissingCeremonyDates[] | null;
  onAssociate: (ceremonyId: number, seriesEventId: number) => Promise<boolean>;
  onRemove: (ceremonyId: number) => void;
  onSetMapping: (categoryEditionId: number, seriesCategoryId: number | null) => void;
  onActivate: () => void;
}) {
  const { state, error, detail, working, activationMissing } = props;

  if (state === "loading")
    return (
      <Stack gap="md" role="status" aria-label="Loading Series">
        <Skeleton height="var(--fo-font-size-hero-title)" width="32%" />
        <Skeleton height="160px" width="100%" />
        <Skeleton height="160px" width="100%" />
      </Stack>
    );
  if (state === "error" || !detail)
    return <PageError message={error ?? "Unable to load the Series"} />;

  const { series } = detail;
  const editable = isSeriesEditable(series.status);
  const disabled = working || !editable;
  const addable = unassociatedCeremonies(
    props.ceremonies,
    detail.ceremonies.map((c) => c.ceremony_id)
  );

  return (
    <Stack component="section" gap="md">
      <Group
        className="header-with-controls"
        justify="space-between"
        align="start"
        wrap="wrap"
      >
        <Box>
          <Title order={2} className="baseline-textHeroTitle">
            {series.name}
          </Title>
          <Text className="muted">
            {series.code}
            {series.opens_on ? ` · opens ${series.opens_on}` : ""}
          </Text>
        </Box>
        <Group className="inline-actions" wrap="wrap">
          <Box component="span" className="status-pill">
            {seriesStatusLabel(series.status)}
          </Box>
          <Button component={Link} to="/admin/series" variant="subtle">
            All Series
          </Button>
        </Group>
      </Group>

      {!editable ? (
        <Box className="status status-warning" role="status">
          Archived Series are read-only.
        </Box>
      ) : null}

      {canActivateSeries(series.status) ? (
        <StandardCard component="section" aria-labelledby="series-activate-title">
          <Title order={3} variant="section" id="series-activate-title">
            Activate
          </Title>
          <Text className="muted">
            Activation does not wait for dates. Ceremonies and mappings stay editable
            afterwards, with a confirmation step.
          </Text>
          <Group className="inline-actions" mt="sm" wrap="wrap">
            <Button type="button" onClick={props.onActivate} disabled={working}>
              Activate Series
            </Button>
          </Group>
        </StandardCard>
      ) : null}

      {activationMissing !== null ? (
        activationMissing.length > 0 ? (
          <MissingDatesNotice
            title="Series activated. These ceremonies still need dates:"
            missing={activationMissing}
          />
        ) : (
          <Box className="status status-success" role="status">
            Series activated. Every ceremony has both dates.
          </Box>
        )
      ) : detail.readiness.missing_dates.length > 0 ? (
        <MissingDatesNotice
          title="These ceremonies still need dates:"
          missing={detail.readiness.missing_dates}
        />
      ) : null}

      <FormStatus loading={working} result={props.status} />

      <SeriesCeremoniesCard
        events={detail.events}
        ceremonies={detail.ceremonies}
        addableCeremonies={addable}
        disabled={disabled}
        onAdd={props.onAssociate}
        onRemove={props.onRemove}
      />

      <SeriesMappingsCard
        ceremonies={detail.ceremonies}
        editions={detail.category_editions}
        categories={detail.categories}
        disabled={disabled}
        onChange={props.onSetMapping}
      />

      <SeriesScheduleCard occasions={detail.occasions} />
    </Stack>
  );
}
