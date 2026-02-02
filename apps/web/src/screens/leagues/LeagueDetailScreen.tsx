import { Link } from "react-router-dom";
import {
  Box,
  Button,
  Card,
  Group,
  NativeSelect,
  Stack,
  Text,
  Title
} from "@mantine/core";
import type { AuthUser } from "../../auth/context";
import { FormStatus } from "../../ui/forms";
import { PageError, PageLoader } from "../../ui/page-state";
import { allocationLabel } from "../../lib/labels";
import type { LeagueDetailView } from "../../orchestration/leagues";

function seasonLabel(season: {
  id: number;
  ceremony_starts_at?: string | null;
  created_at?: string | null;
}) {
  const date = season.ceremony_starts_at ?? season.created_at;
  try {
    const year = new Date(date ?? "").getFullYear();
    if (Number.isFinite(year)) return `Season ${year}`;
  } catch {
    // Fall back to id below.
  }
  return `Season ${season.id}`;
}

export function LeagueDetailScreen(props: {
  user: AuthUser | null;
  leagueId: number;
  view: LeagueDetailView;
  working: boolean;
  rosterStatus: { ok: boolean; message: string } | null;
  transferTarget: string;
  setTransferTarget: (v: string) => void;
  onCopyInvite: () => void | Promise<unknown>;
  onTransferOwnership: () => void | Promise<unknown>;
  onRemoveMember: (userId: number, role: string) => void | Promise<unknown>;
}) {
  const {
    user,
    leagueId,
    view,
    working,
    rosterStatus,
    transferTarget,
    setTransferTarget,
    onCopyInvite,
    onTransferOwnership,
    onRemoveMember
  } = props;

  if (view.state === "loading") {
    return <PageLoader label="Loading league..." />;
  }
  if (view.state === "forbidden") {
    return (
      <Card className="card" component="section">
        <Box component="header">
          <Title order={2}>League</Title>
          <Text className="muted">Access denied.</Text>
        </Box>
        <PageError message={view.message} />
      </Card>
    );
  }
  if (view.state === "error") {
    return (
      <Card className="card" component="section">
        <Box component="header">
          <Title order={2}>League</Title>
          <Text className="muted">Unable to load</Text>
        </Box>
        <PageError message={view.message} />
      </Card>
    );
  }

  const league = view.league;

  return (
    <Card className="card" component="section">
      <Group
        className="header-with-controls"
        justify="space-between"
        align="start"
        wrap="wrap"
      >
        <Box>
          <Title order={2}>{league.name ?? `League #${leagueId}`}</Title>
          <Text className="muted">Roster, seasons, and commissioner actions.</Text>
        </Box>
      </Group>

      <Card className="card nested" component="section" mt="md">
        <Box component="header">
          <Title order={3}>Roster</Title>
          <Text className="muted">Members and roles</Text>
        </Box>
        {view.roster === null ? (
          <Text className="muted">Roster hidden (commissioner-only).</Text>
        ) : view.roster.length === 0 ? (
          <Text className="muted">No members yet.</Text>
        ) : (
          <Stack component="ul" className="list">
            {view.roster.map((m) => (
              <Box key={m.id} component="li" className="list-row">
                <Text span>{m.username}</Text>
                <Box component="span" className="pill">
                  {m.role}
                </Box>
                {view.isCommissioner && m.role !== "OWNER" && (
                  <Button
                    type="button"
                    variant="subtle"
                    onClick={() => void onRemoveMember(m.user_id, m.role)}
                    disabled={working}
                  >
                    Remove
                  </Button>
                )}
              </Box>
            ))}
          </Stack>
        )}
        {view.isCommissioner && (
          <Group className="inline-actions" mt="sm" wrap="wrap">
            <Button type="button" onClick={() => void onCopyInvite()}>
              Copy invite
            </Button>
            <FormStatus loading={working} result={rosterStatus} />
          </Group>
        )}
      </Card>

      {view.isCommissioner && (
        <Card className="card nested" component="section" mt="md">
          <Box component="header">
            <Title order={3}>Commissioner Controls</Title>
            <Text className="muted">
              Transfer commissioner role or remove members. Owner only for transfer.
            </Text>
          </Box>
          <Group className="inline-actions" wrap="wrap">
            <NativeSelect
              aria-label="Transfer to member"
              value={transferTarget}
              onChange={(e) => setTransferTarget(e.currentTarget.value)}
              disabled={!view.isOwner || working}
              data={[
                { value: "", label: "Transfer to...", disabled: true },
                ...(view.roster
                  ?.filter((m) => m.user_id !== Number(user?.sub))
                  .map((m) => ({
                    value: String(m.user_id),
                    label: `${m.username} (${m.role})`
                  })) ?? [])
              ]}
            />
            <Button
              type="button"
              onClick={() => void onTransferOwnership()}
              disabled={!view.isOwner || working || !transferTarget}
            >
              Transfer commissioner
            </Button>
          </Group>
          <FormStatus loading={working} result={rosterStatus} />
        </Card>
      )}

      <Card className="card nested" component="section" mt="md">
        <Group
          className="header-with-controls"
          justify="space-between"
          align="start"
          wrap="wrap"
        >
          <Box>
            <Title order={3}>Seasons</Title>
            <Text className="muted">Active and past seasons for this league.</Text>
          </Box>
          {view.isCommissioner && (
            <Group className="inline-actions" wrap="wrap">
              <Button component={Link} to={`/leagues/${leagueId}/seasons/new`}>
                Create season
              </Button>
            </Group>
          )}
        </Group>
        {view.seasons.length === 0 ? (
          <Text className="muted">
            No seasons yet. Once an active ceremony is configured, you can create the
            first season.
          </Text>
        ) : (
          <Box className="grid">
            {view.seasons.map((s) => (
              <Card key={s.id} className="card">
                <Box component="header">
                  <Title order={4}>{seasonLabel(s)}</Title>
                  <Text className="muted">
                    {s.is_active_ceremony === false
                      ? "Archived season"
                      : "Current season"}
                  </Text>
                </Box>
                <Group className="pill-list" wrap="wrap">
                  <Box component="span" className="pill">
                    {s.is_active_ceremony === false ? "ARCHIVED" : "ACTIVE"}
                  </Box>
                  <Box component="span" className="pill">
                    Status: {s.status}
                  </Box>
                  <Box component="span" className="pill">
                    Ceremony {s.ceremony_id}
                  </Box>
                  {s.remainder_strategy && (
                    <Box component="span" className="pill">
                      {allocationLabel(s.remainder_strategy)}
                    </Box>
                  )}
                  {s.draft_status && (
                    <Box component="span" className="pill">
                      Draft: {s.draft_status}
                    </Box>
                  )}
                </Group>
                <Group className="inline-actions" mt="sm" wrap="wrap">
                  <Button component={Link} to={`/seasons/${s.id}`} variant="subtle">
                    Open season
                  </Button>
                </Group>
              </Card>
            ))}
          </Box>
        )}
      </Card>
    </Card>
  );
}
