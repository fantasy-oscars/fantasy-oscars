import { Link } from "react-router-dom";
import { Box, Button, Group, Skeleton, Stack, Text, Title } from "@ui";
import type { AreaSaveResult, CircuitLeagueView } from "@/orchestration/circuitLeague";
import type { FullSeasonSettings, SettingsArea } from "@/decisions/fullSeasonSettings";
import { circuitLeagueStatusLabel } from "@/decisions/circuitLeague";
import { circuitDraftLinkLabel } from "@/decisions/circuitDraft";
import { circuitRostersVisible } from "@/decisions/circuitRoster";
import { circuitStandingsVisible } from "@/decisions/circuitStandings";
import { circuitWaiversVisible } from "@/decisions/circuitWaivers";
import type { CircuitAddDropTarget } from "@/decisions/circuitAddDrop";
import { statusTone } from "@/decisions/statusTone";
import type { ApiResult } from "@/lib/types";
import {
  circuitDraftPath,
  circuitRosterPath,
  circuitRulesPath,
  circuitStandingsPath,
  circuitTransactionsPath,
  circuitWaiversPath,
  leaguePath
} from "@/lib/routes";
import { PageError } from "@/shared/page-state";
import { StatusPill } from "@/shared/pills";
import { StandardCard } from "@/primitives";
import { CircuitLeagueMembersSection } from "@/features/circuitLeagues/ui/CircuitLeagueMembersSection";
import { CircuitLeagueMembershipBar } from "@/features/circuitLeagues/ui/CircuitLeagueMembershipBar";
import { FullSeasonSettingsSection } from "./FullSeasonSettingsSection";
import "@/primitives/baseline.css";

const ADD_DROP_NOTE_ID = "full-season-add-drop-note";

function CircuitLeagueSkeleton() {
  return (
    <Box className="baseline-page" role="status" aria-label="Loading season">
      <Box className="baseline-pageInner">
        <Stack component="section" gap="md">
          <Skeleton height="var(--fo-font-size-hero-title)" width="44%" />
          <Box className="baseline-grid2Wide">
            <StandardCard>
              <Stack gap="sm">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <Skeleton key={idx} height="56px" width="100%" />
                ))}
              </Stack>
            </StandardCard>
            <Stack gap="sm">
              <Skeleton height="var(--fo-font-size-sm)" width="30%" />
              {Array.from({ length: 4 }).map((_, idx) => (
                <Skeleton key={idx} height="var(--fo-font-size-sm)" width="72%" />
              ))}
            </Stack>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}

export function CircuitLeagueScreen(props: {
  view: CircuitLeagueView;
  /** Where Add/drop leads; null hides it (not in season, not a member, or loading). */
  addDrop?: CircuitAddDropTarget | null;
  acting: boolean;
  memberStatus: ApiResult | null;
  lockStatus: ApiResult | null;
  onSaveArea: (area: SettingsArea, next: FullSeasonSettings) => Promise<AreaSaveResult>;
  onJoin: () => void;
  onLeave: () => void;
  onInitialize: () => void;
}) {
  const { view } = props;

  if (view.state === "loading") return <CircuitLeagueSkeleton />;
  if (view.state === "error") {
    return (
      <Box className="baseline-page">
        <Box className="baseline-pageInner">
          <Stack component="section" gap="md">
            <Box component="header">
              <Title order={2} className="baseline-textHeroTitle">
                Season
              </Title>
              <Text className="baseline-textBody">
                {view.notFound ? "Season not found." : "Unable to load"}
              </Text>
            </Box>
            <PageError message={view.message} requestId={view.requestId} />
          </Stack>
        </Box>
      </Box>
    );
  }

  const { detail, settings, editable } = view;
  const { league, viewer } = detail;
  const statusLabel = circuitLeagueStatusLabel(detail.circuit_league.status);
  const link = {
    leagueId: league.id,
    leagueName: league.name,
    circuitLeagueId: detail.circuit_league.id
  };
  const addDrop = props.addDrop ?? null;
  const addDropPath = addDrop
    ? `${addDrop.page === "roster" ? circuitRosterPath(link) : circuitWaiversPath(link)}${
        addDrop.hash ? `#${addDrop.hash}` : ""
      }`
    : null;

  return (
    <Box className="baseline-page">
      <Box className="baseline-pageInner">
        <Stack component="section" gap="md">
          <Group
            component="header"
            justify="space-between"
            align="flex-start"
            wrap="wrap"
          >
            <Stack gap="var(--fo-space-dense-2)" miw="var(--fo-space-0)">
              <Title order={2} className="baseline-textHeroTitle baseline-wrapAnywhere">
                {detail.circuit?.name ?? "Season"}
              </Title>
              <Group gap="sm" wrap="wrap">
                <Text className="baseline-textBody baseline-wrapAnywhere">
                  {league.name}
                </Text>
                <StatusPill {...statusTone(statusLabel)}>{statusLabel}</StatusPill>
              </Group>
            </Stack>
            <Stack gap="xs" className="full-season-actions">
              <Group gap="sm" wrap="wrap">
                {addDrop && addDropPath ? (
                  <Button
                    component={Link}
                    to={addDropPath}
                    variant="filled"
                    className="full-season-addDrop"
                    aria-describedby={addDrop.note ? ADD_DROP_NOTE_ID : undefined}
                  >
                    Add/drop
                  </Button>
                ) : null}
                <Button component={Link} to={circuitDraftPath(link)} variant="outline">
                  {circuitDraftLinkLabel(detail.circuit_league.status)}
                </Button>
                {circuitRostersVisible(detail.circuit_league.status) ? (
                  <>
                    <Button
                      component={Link}
                      to={circuitRosterPath(link)}
                      variant="outline"
                    >
                      {viewer.is_member ? "Your roster" : "Rosters"}
                    </Button>
                    <Button
                      component={Link}
                      to={circuitTransactionsPath(link)}
                      variant="outline"
                    >
                      Transactions
                    </Button>
                    {circuitWaiversVisible(detail.circuit_league.status) ? (
                      <Button
                        component={Link}
                        to={circuitWaiversPath(link)}
                        variant="outline"
                      >
                        Waivers
                      </Button>
                    ) : null}
                    {circuitStandingsVisible(detail.circuit_league.status) ? (
                      <Button
                        component={Link}
                        to={circuitStandingsPath(link)}
                        variant="outline"
                      >
                        Standings
                      </Button>
                    ) : null}
                  </>
                ) : null}
                <Button component={Link} to={circuitRulesPath(link)} variant="outline">
                  Rules
                </Button>
                <Button
                  component={Link}
                  to={leaguePath({ leagueId: league.id, leagueName: league.name })}
                  variant="outline"
                >
                  Back to league
                </Button>
              </Group>
              {addDrop?.note ? (
                <Text
                  id={ADD_DROP_NOTE_ID}
                  role="status"
                  variant="muted"
                  className="baseline-textBody"
                >
                  {addDrop.note}
                </Text>
              ) : null}
            </Stack>
          </Group>

          <CircuitLeagueMembershipBar
            open={editable.all}
            canJoin={viewer.is_league_member}
            isMember={viewer.is_member}
            acting={props.acting}
            status={props.memberStatus}
            onJoin={props.onJoin}
            onLeave={props.onLeave}
          />

          <Box className="baseline-grid2Wide">
            <FullSeasonSettingsSection
              detail={detail}
              settings={settings}
              onSave={props.onSaveArea}
            />
            <CircuitLeagueMembersSection
              members={detail.members}
              open={editable.all}
              canManage={viewer.can_manage}
              acting={props.acting}
              lockStatus={props.lockStatus}
              onInitialize={props.onInitialize}
            />
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}
