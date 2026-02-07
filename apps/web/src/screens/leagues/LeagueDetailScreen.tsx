import { Link } from "react-router-dom";
import {
  Box,
  Button,
  Divider,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  Title
} from "@mantine/core";
import type { AuthUser } from "../../auth/context";
import { FormStatus } from "../../ui/forms";
import { PageError, PageLoader } from "../../ui/page-state";
import type { LeagueDetailView } from "../../orchestration/leagues";
import { useMemo, useState } from "react";
import { CommissionerPill, StatusPill } from "../../ui/pills";
import { StandardCard } from "../../primitives";
import "../../primitives/baseline.css";

function ceremonyLabelForSeason(season: {
  ceremony_starts_at?: string | null;
  ceremony_name?: string | null;
  ceremony_code?: string | null;
  ceremony_id: number;
}) {
  if (season.ceremony_name) return season.ceremony_name;
  if (season.ceremony_code) return season.ceremony_code;
  return `Ceremony ${season.ceremony_id}`;
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

  const rosterList = view.state === "ready" ? (view.roster ?? []) : [];
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

          <Box
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)",
              gap: 18,
              alignItems: "start"
            }}
          >
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
                    const ceremonyLabel = ceremonyLabelForSeason(s);
                    const statusLabel = (() => {
                      const seasonStatus = String(s.status ?? "").toUpperCase();
                      if (s.is_active_ceremony === false || seasonStatus === "ARCHIVED")
                        return "Archived";
                      if (seasonStatus === "COMPLETE") return "Complete";
                      if (seasonStatus === "IN_PROGRESS") return "In progress";
                      const ds = String(s.draft_status ?? "").toUpperCase();
                      if (ds === "COMPLETED") return "Draft complete";
                      if (ds === "LIVE" || ds === "IN_PROGRESS" || ds === "PAUSED")
                        return "Drafting";
                      return "Pre-draft";
                    })();

                    return (
                      <StandardCard
                        key={s.id}
                        component={Link}
                        to={`/seasons/${s.id}`}
                        interactive
                      >
                        <Group
                          justify="space-between"
                          align="flex-start"
                          wrap="nowrap"
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

          <Modal
            opened={transferOpen}
            onClose={() => setTransferOpen(false)}
            title="Transfer ownership"
            centered
          >
            <Stack gap="sm">
              <Text className="baseline-textBody">
                Transfer league ownership to another member. The new commissioner will
                manage seasons and winners.
              </Text>
              <Select
                label="Member"
                placeholder="Select member"
                value={transferTarget}
                onChange={setTransferTarget}
                data={transferOptions}
              />
              <Group justify="flex-end">
                <Button variant="subtle" onClick={() => setTransferOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    const id = transferTarget ? Number(transferTarget) : NaN;
                    if (!Number.isFinite(id)) return;
                    void onTransferOwnershipTo(id);
                    setTransferOpen(false);
                    setTransferTarget(null);
                  }}
                  disabled={!transferTarget || working}
                >
                  Transfer ownership
                </Button>
              </Group>
            </Stack>
          </Modal>

          <Modal
            opened={deleteOpen}
            onClose={() => setDeleteOpen(false)}
            title="Delete league?"
            centered
          >
            <Stack gap="sm">
              <Text className="baseline-textBody">
                Delete this league and all of its seasons. This cannot be undone.
              </Text>
              <Group justify="flex-end">
                <Button variant="subtle" onClick={() => setDeleteOpen(false)}>
                  Cancel
                </Button>
                <Button
                  color="red"
                  onClick={() => {
                    void Promise.resolve(onDeleteLeague()).then(() =>
                      setDeleteOpen(false)
                    );
                  }}
                  disabled={working}
                >
                  Delete
                </Button>
              </Group>
            </Stack>
          </Modal>
        </Stack>
      </Box>
    </Box>
  );
}
