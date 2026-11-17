import { Link } from "react-router-dom";
import { Box, Button, Group, Skeleton, Stack, Text, Title } from "@ui";
import type { LeagueSeasonCreateView } from "@/orchestration/seasons";
import { selectedSeasonKind, type SeasonKind } from "@/decisions/seasonKinds";
import { PageError } from "@/shared/page-state";
import { StandardCard } from "@/primitives";
import { leaguePath } from "@/lib/routes";
import { SeasonKindChoice } from "@/features/seasons/ui/create/SeasonKindChoice";
import { CeremonySeasonForm } from "@/features/seasons/ui/create/CeremonySeasonForm";
import type { FullSeasonSettings, SettingsArea } from "@/decisions/fullSeasonSettings";
import { FullSeasonCreateSection } from "./FullSeasonCreateSection";
import "@/primitives/baseline.css";

export function LeagueSeasonCreateScreen(props: {
  leagueId: number;
  view: LeagueSeasonCreateView;
  /** The kind asked for in the URL; ignored when it is unavailable. */
  requestedKind: SeasonKind | null;
  actions: {
    chooseKind: (kind: SeasonKind) => void;
    retryFull: () => void;
    setFullCircuitId: (v: number | null) => void;
    resetFull: () => void;
    submitFull: () => void;
    retryFullOptions: () => void;
    applyFullArea: (area: SettingsArea, next: FullSeasonSettings) => { ok: true };
    setCeremonyId: (v: number | null) => void;
    setScoringStrategy: (v: "fixed" | "negative" | "category_weighted") => void;
    setRemainderStrategy: (v: "UNDRAFTED" | "FULL_POOL") => void;
    setTimerEnabled: (v: boolean) => void;
    setPickTimerSeconds: (v: number) => void;
    reset: () => void;
    submit: () => void;
  };
}) {
  const { leagueId, view, requestedKind, actions } = props;

  if (view.state === "loading") {
    return (
      <Box className="baseline-page">
        <Box className="baseline-pageInner">
          <Stack
            gap="md"
            component="section"
            role="status"
            aria-label="Loading season form"
          >
            <Group justify="space-between" align="flex-start" wrap="wrap">
              <Box>
                <Skeleton height="var(--fo-font-size-hero-title)" width="36%" />
                <Box mt="var(--fo-space-dense-2)">
                  <Skeleton height="var(--fo-font-size-sm)" width="46%" />
                </Box>
              </Box>
              <Skeleton height="36px" width="120px" />
            </Group>
            <StandardCard>
              <Stack gap="sm">
                <Skeleton height="var(--fo-font-size-lg)" width="20%" />
                <Skeleton height="44px" width="100%" />
                <Skeleton height="44px" width="100%" />
              </Stack>
            </StandardCard>
            <StandardCard>
              <Stack gap="sm">
                <Skeleton height="56px" width="100%" />
                <Skeleton height="56px" width="100%" />
                <Skeleton height="56px" width="100%" />
                <Group justify="space-between" align="end" wrap="wrap">
                  <Skeleton height="56px" width="150px" />
                  <Skeleton height="56px" width="180px" />
                </Group>
                <Group gap="sm">
                  <Skeleton height="36px" width="130px" />
                  <Skeleton height="36px" width="100px" />
                </Group>
              </Stack>
            </StandardCard>
          </Stack>
        </Box>
      </Box>
    );
  }

  if (view.state === "forbidden") {
    return (
      <Box className="baseline-page">
        <Box className="baseline-pageInner">
          <Stack gap="md" component="section">
            <Box component="header">
              <Title order={2} className="baseline-textHeroTitle">
                Create season
              </Title>
              <Text className="baseline-textBody">Access denied.</Text>
            </Box>
            <PageError message={view.message} />
          </Stack>
        </Box>
      </Box>
    );
  }

  if (view.state === "error") {
    return (
      <Box className="baseline-page">
        <Box className="baseline-pageInner">
          <Stack gap="md" component="section">
            <Box component="header">
              <Title order={2} className="baseline-textHeroTitle">
                Create season
              </Title>
              <Text className="baseline-textBody">Unable to load</Text>
            </Box>
            <PageError message={view.message} />
          </Stack>
        </Box>
      </Box>
    );
  }

  const leagueName = view.league?.name ?? "this league";
  const kind = selectedSeasonKind({ requested: requestedKind, availability: view.kinds });

  return (
    <Box className="baseline-page">
      <Box className="baseline-pageInner">
        <Stack gap="md" component="section">
          <Group
            component="header"
            justify="space-between"
            align="flex-start"
            wrap="wrap"
          >
            <Box>
              <Title order={2} className="baseline-textHeroTitle">
                Create season
              </Title>
              <Text className="baseline-textBody">
                Create a new season for {leagueName}.
              </Text>
            </Box>
            <Button
              component={Link}
              to={leaguePath({ leagueId, leagueName: view.league?.name })}
              variant="secondary"
            >
              Back to league
            </Button>
          </Group>

          <SeasonKindChoice
            kinds={view.kinds}
            selected={kind}
            onChoose={actions.chooseKind}
            checkingFull={view.checkingFull}
            onRetryFull={actions.retryFull}
            disabled={view.working || view.fullWorking}
          />

          {kind === "ceremony" ? (
            <CeremonySeasonForm view={view} actions={actions} />
          ) : kind === "full" ? (
            <FullSeasonCreateSection view={view} actions={actions} />
          ) : null}
        </Stack>
      </Box>
    </Box>
  );
}
