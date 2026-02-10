import { Link } from "react-router-dom";
import {
  Box,
  Button,
  Divider,
  Group,
  Stack,
  Text,
  Title
} from "@mantine/core";
import type { AuthUser } from "../../auth/context";
import { FormStatus } from "../../ui/forms";
import { PageError, PageLoader } from "../../ui/page-state";
import type { LeagueMember } from "../../lib/types";
import type { LeagueDetailView } from "../../orchestration/leagues";
import { useMemo, useState } from "react";
import { CommissionerPill, StatusPill } from "../../ui/pills";
import { StandardCard } from "../../primitives";
import { computeSeasonCeremonyLabel } from "../../decisions/league";
import { computeSeasonLifecycleLabelFromRow } from "../../decisions/season";
import { DeleteLeagueModal } from "../../ui/leagues/modals/DeleteLeagueModal";
import { TransferLeagueOwnershipModal } from "../../ui/leagues/modals/TransferLeagueOwnershipModal";
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
            {/* LEFT: Seasons */}
            <Stack gap="sm">
              <Group justify="space-between" align="flex-end" wrap="wrap">
                <Title order={3}>Seasons</Title>
                <Button
                  component={Link}
                  to={`/leagues/${leagueId}/seasons/new`}
                  disabled={!view.isCommissioner}
                  title={
                    view.isCommissioner ? undefined : "Commissioner permission required"
                  }
                >
                  Create season
                </Button>
              </Group>

              {view.seasons.length === 0 ? (
                <Text className="baseline-textBody">No seasons yet.</Text>
              ) : (
                <Stack
                  component="ul"
                  gap="sm"
                  style={{ listStyle: "none", margin: 0, padding: 0 }}
                >
                  {view.seasons.map((s) => {
                    const ceremonyLabel = computeSeasonCeremonyLabel(s);
                    const statusLabel = computeSeasonLifecycleLabelFromRow({
                      seasonStatus: s.status,
                      draftStatus: s.draft_status,
                      isActiveCeremony: s.is_active_ceremony
                    });

                    return (
                      <Box key={s.id} component="li">
                        <StandardCard
                          component={Link}
                          to={`/seasons/${s.id}`}
                          interactive
                        >
                          <Group
                            justify="space-between"
                            align="flex-start"
                            wrap="wrap"
                            gap="md"
                          >
                            <Box style={{ minWidth: 0 }}>
                              <Text className="baseline-textCardTitle">
                                {ceremonyLabel}
                              </Text>
                            </Box>
                            <StatusPill>{statusLabel.toUpperCase()}</StatusPill>
                          </Group>
                        </StandardCard>
                      </Box>
                    );
                  })}
                </Stack>
              )}
            </Stack>

            {/* RIGHT: Members + controls */}
            <Stack gap="md">
              <Stack gap="sm">
                <Title order={4}>Members</Title>
                <Divider />

                {rosterList.length === 0 ? (
                  <Text className="baseline-textBody">No members yet.</Text>
                ) : (
                  <Stack
                    component="ul"
                    gap={0}
                    style={{ listStyle: "none", margin: 0, padding: 0 }}
                  >
                    {rosterList.map((m, idx) => (
                      <Box key={m.id} component="li">
                        <Group justify="space-between" align="center" wrap="wrap" py="sm">
                          <Text className="baseline-textBody">{m.username}</Text>
                          {m.role === "OWNER" ? <CommissionerPill /> : null}
                        </Group>
                        {idx === rosterList.length - 1 ? null : <Divider />}
                      </Box>
                    ))}
                  </Stack>
                )}
              </Stack>

          {view.isOwner ? (
                <Stack gap="sm">
                  <Title order={4}>Management</Title>
                  <Divider />

                  <Group wrap="wrap">
                    <Button
                      type="button"
                      variant="subtle"
                      onClick={() => setTransferOpen(true)}
                    >
                      Transfer ownership
                    </Button>
                    <Button
                      type="button"
                      color="red"
                      variant="subtle"
                      onClick={() => setDeleteOpen(true)}
                    >
                      Delete league
                    </Button>
                  </Group>
                  <FormStatus loading={working} result={rosterStatus} />
                </Stack>
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
