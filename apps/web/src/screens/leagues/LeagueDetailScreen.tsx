import { Box, Group, Stack, Text, Title } from "@ui";
import type { AuthUser } from "../../auth/context";
import { PageError, PageLoader } from "../../ui/page-state";
import type { LeagueMember } from "../../lib/types";
import type { LeagueDetailView } from "../../orchestration/leagues";
import { useMemo, useState } from "react";
import { computeSeasonCeremonyLabel } from "../../decisions/league";
import { computeSeasonLifecycleLabelFromRow } from "../../decisions/season";
import { DeleteLeagueModal } from "../../ui/leagues/modals/DeleteLeagueModal";
import { TransferLeagueOwnershipModal } from "../../ui/leagues/modals/TransferLeagueOwnershipModal";
import { LeagueMembersSection } from "../../ui/leagues/LeagueMembersSection";
import { LeagueManagementSection } from "../../ui/leagues/LeagueManagementSection";
import { LeagueSeasonsSection } from "../../ui/leagues/LeagueSeasonsSection";
import "../../primitives/baseline.css";

const EMPTY_ROSTER: LeagueMember[] = [];

export function LeagueDetailScreen(props: {
  user: AuthUser | null;
  leagueId: number;
  view: LeagueDetailView;
  working: boolean;
  rosterStatus: { ok: boolean; message: string } | null;
  onTransferOwnershipTo: (userId: number) => void | Promise<unknown>;
  onDeleteLeague: () => Promise<{ ok: boolean }> | { ok: boolean };
}) {
  const {
    user,
    leagueId,
    view,
    working,
    rosterStatus,
    onTransferOwnershipTo,
    onDeleteLeague
  } = props;

  // Hooks must not be conditional (Rules of Hooks).
  const [transferOpen, setTransferOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<string | null>(null);

  const rosterList =
    view.state === "ready" ? (view.roster ?? EMPTY_ROSTER) : EMPTY_ROSTER;
  const transferOptions = useMemo(() => {
    const me = Number(user?.sub);
    return rosterList
      .filter((m) => m.user_id !== me)
      .map((m) => ({ value: String(m.user_id), label: m.username }));
  }, [rosterList, user?.sub]);

  if (view.state === "loading") {
    return <PageLoader label="Loading league..." />;
  }
  if (view.state === "forbidden") {
    return (
      <Box className="baseline-page">
        <Box className="baseline-pageInner">
          <Stack component="section" gap="md">
            <Box component="header">
              <Title order={2} className="baseline-textHeroTitle">
                League
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
          <Stack component="section" gap="md">
            <Box component="header">
              <Title order={2} className="baseline-textHeroTitle">
                League
              </Title>
              <Text className="baseline-textBody">Unable to load</Text>
            </Box>
            <PageError message={view.message} />
          </Stack>
        </Box>
      </Box>
    );
  }

  const league = view.league;
  const seasonCards = view.seasons.map((s) => {
    const ceremonyLabel = computeSeasonCeremonyLabel(s);
    const statusLabel = computeSeasonLifecycleLabelFromRow({
      seasonStatus: s.status,
      draftStatus: s.draft_status,
      isActiveCeremony: s.is_active_ceremony
    });
    return { id: s.id, ceremonyLabel, statusLabel };
  });

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
            <Title order={2} className="baseline-textHeroTitle">
              {league.name ?? `League #${leagueId}`}
            </Title>
          </Group>

          <Box className="baseline-grid2Wide">
            <LeagueSeasonsSection
              leagueId={leagueId}
              canCreateSeason={view.isCommissioner}
              seasons={seasonCards}
            />

            <Stack gap="md">
              <LeagueMembersSection members={rosterList} />
              {view.isOwner ? (
                <LeagueManagementSection
                  working={working}
                  rosterStatus={rosterStatus}
                  onOpenTransfer={() => setTransferOpen(true)}
                  onOpenDelete={() => setDeleteOpen(true)}
                />
              ) : null}
            </Stack>
          </Box>

          <TransferLeagueOwnershipModal
            opened={transferOpen}
            onClose={() => setTransferOpen(false)}
            working={working}
            value={transferTarget}
            onChange={setTransferTarget}
            options={transferOptions}
            onConfirm={() => {
              const id = transferTarget ? Number(transferTarget) : NaN;
              if (!Number.isFinite(id)) return;
              void onTransferOwnershipTo(id);
              setTransferOpen(false);
              setTransferTarget(null);
            }}
          />

          <DeleteLeagueModal
            opened={deleteOpen}
            onClose={() => setDeleteOpen(false)}
            working={working}
            onConfirm={() => {
              void Promise.resolve(onDeleteLeague()).then(() => setDeleteOpen(false));
            }}
          />
        </Stack>
      </Box>
    </Box>
  );
}
