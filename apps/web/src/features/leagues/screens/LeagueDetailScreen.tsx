import { Box, Group, Skeleton, Stack, Text, Title } from "@ui";
import type { AuthUser } from "@/auth/context";
import { PageError } from "@/shared/page-state";
import type { LeagueMember } from "@/lib/types";
import type { LeagueDetailView } from "@/orchestration/leagues";
import { useMemo, useState } from "react";
import { computeSeasonCeremonyLabel } from "@/decisions/league";
import { computeSeasonLifecycleLabelFromRow } from "@/decisions/season";
import { DeleteLeagueModal } from "@/features/leagues/ui/modals/DeleteLeagueModal";
import { TransferLeagueOwnershipModal } from "@/features/leagues/ui/modals/TransferLeagueOwnershipModal";
import { LeagueMembersSection } from "@/features/leagues/ui/LeagueMembersSection";
import { LeagueManagementSection } from "@/features/leagues/ui/LeagueManagementSection";
import { LeagueSeasonsSection } from "@/features/leagues/ui/LeagueSeasonsSection";
import "@/primitives/baseline.css";

const EMPTY_ROSTER: LeagueMember[] = [];

function LeagueDetailSkeleton() {
  return (
    <Box className="baseline-page" role="status" aria-label="Loading league">
      <Box className="baseline-pageInner">
        <Stack component="section" gap="md">
          <Group
            component="header"
            justify="space-between"
            align="flex-start"
            wrap="wrap"
          >
            <Skeleton height="var(--fo-font-size-hero-title)" width="44%" />
          </Group>

          <Box className="baseline-grid2Wide">
            <Stack gap="sm">
              <Group justify="space-between" align="flex-end" wrap="wrap">
                <Skeleton height="var(--fo-font-size-sm)" width="22%" />
                <Skeleton height="var(--fo-font-size-sm)" width="18%" />
              </Group>
              <Stack gap="sm">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <Box key={idx} className="baseline-card baseline-standardCard">
                    <Group
                      justify="space-between"
                      align="flex-start"
                      wrap="wrap"
                      gap="md"
                    >
                      <Skeleton height="var(--fo-font-size-sm)" width="55%" />
                      <Skeleton height="var(--fo-font-size-xs)" width="22%" />
                    </Group>
                  </Box>
                ))}
              </Stack>
            </Stack>

            <Stack gap="md">
              <Stack gap="sm">
                <Skeleton height="var(--fo-font-size-sm)" width="30%" />
                <Stack gap="var(--fo-space-dense-2)">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <Skeleton key={idx} height="var(--fo-font-size-sm)" width="72%" />
                  ))}
                </Stack>
              </Stack>

              <Stack gap="sm">
                <Skeleton height="var(--fo-font-size-sm)" width="36%" />
                <Stack gap="var(--fo-space-dense-2)">
                  <Skeleton height="var(--fo-font-size-sm)" width="55%" />
                  <Skeleton height="var(--fo-font-size-sm)" width="48%" />
                </Stack>
              </Stack>
            </Stack>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}

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
    return <LeagueDetailSkeleton />;
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
    return {
      id: s.id,
      ceremonyId: s.ceremony_id,
      ceremonyCode: s.ceremony_code ?? null,
      ceremonyLabel,
      statusLabel
    };
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
              leagueName={league.name}
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
            seasonsRemoved={view.seasons.length}
            onConfirm={() => {
              void Promise.resolve(onDeleteLeague()).then(() => setDeleteOpen(false));
            }}
          />
        </Stack>
      </Box>
    </Box>
  );
}
