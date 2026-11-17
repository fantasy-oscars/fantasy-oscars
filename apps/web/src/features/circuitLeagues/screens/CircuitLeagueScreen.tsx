import { Link } from "react-router-dom";
import { Box, Button, Group, Skeleton, Stack, Text, Title } from "@ui";
import type { CircuitLeagueView } from "@/orchestration/circuitLeague";
import type { CircuitLeagueForm } from "@/decisions/circuitLeague";
import { circuitLeagueStatusLabel } from "@/decisions/circuitLeague";
import { statusTone } from "@/decisions/statusTone";
import type { ApiResult } from "@/lib/types";
import { leaguePath } from "@/lib/routes";
import { PageError } from "@/shared/page-state";
import { StatusPill } from "@/shared/pills";
import { StandardCard } from "@/primitives";
import { CircuitLeagueMembersSection } from "@/features/circuitLeagues/ui/CircuitLeagueMembersSection";
import { CircuitLeagueMembershipBar } from "@/features/circuitLeagues/ui/CircuitLeagueMembershipBar";
import { CircuitLeagueSettingsForm } from "@/features/circuitLeagues/ui/CircuitLeagueSettingsForm";
import "@/primitives/baseline.css";

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
  saving: boolean;
  acting: boolean;
  settingsStatus: ApiResult | null;
  memberStatus: ApiResult | null;
  lockStatus: ApiResult | null;
  onChange: (patch: (prev: CircuitLeagueForm) => CircuitLeagueForm) => void;
  onSave: () => void;
  onReset: () => void;
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

  const { detail, form, editable, dirty } = view;
  const { league, viewer } = detail;
  const statusLabel = circuitLeagueStatusLabel(detail.circuit_league.status);

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
            <Button
              component={Link}
              to={leaguePath({ leagueId: league.id, leagueName: league.name })}
              variant="outline"
            >
              Back to league
            </Button>
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
            <CircuitLeagueSettingsForm
              form={form}
              settings={detail.circuit_league}
              events={detail.events}
              categories={detail.categories}
              canManage={viewer.can_manage}
              editable={editable}
              dirty={dirty}
              saving={props.saving}
              status={props.settingsStatus}
              onChange={props.onChange}
              onSave={props.onSave}
              onReset={props.onReset}
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
