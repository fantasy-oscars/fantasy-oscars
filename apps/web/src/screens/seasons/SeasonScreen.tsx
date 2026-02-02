import { Link } from "react-router-dom";
import {
  Box,
  Button,
  Card,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import { allocationLabel } from "../../lib/labels";
import { FormStatus } from "../../ui/forms";
import { PageLoader } from "../../ui/page-state";

export function SeasonScreen(props: {
  seasonIdLabel: string;
  leagueIdForBackLink?: number | null;
  view: ReturnType<typeof import("../../orchestration/seasons").useSeasonOrchestration>;
  onDeleteSeason: () => void | Promise<void>;
}) {
  const { seasonIdLabel, leagueIdForBackLink, view: s, onDeleteSeason } = props;

  if (s.loading) return <PageLoader label="Loading season..." />;
  if (s.error) {
    return (
      <Card className="card" component="section">
        <Box component="header">
          <Title order={2}>Season {seasonIdLabel}</Title>
          <Text className="muted">Could not load season data.</Text>
        </Box>
        <Box className="status status-error">{s.error}</Box>
      </Card>
    );
  }

  return (
    <Card className="card" component="section">
      <Group
        className="header-with-controls"
        justify="space-between"
        align="start"
        wrap="wrap"
      >
        <Box>
          <Title order={2}>Season {seasonIdLabel}</Title>
          <Text className="muted">
            {s.leagueContext?.league?.name
              ? `League ${s.leagueContext.league.name} • Ceremony ${
                  s.leagueContext.league.ceremony_id ?? "TBD"
                }`
              : "Season participants and invites"}
          </Text>
        </Box>
        {s.canEdit && (
          <Group className="inline-actions" wrap="wrap">
            <Button
              type="button"
              className="danger"
              disabled={s.working}
              onClick={onDeleteSeason}
            >
              Delete season
            </Button>
          </Group>
        )}
        <Group className="pill-list" wrap="wrap">
          <Box component="span" className="pill">
            Status: {s.seasonStatus}
          </Box>
          <Box component="span" className="pill">
            {s.isArchived ? "ARCHIVED (read-only)" : "ACTIVE"}
          </Box>
          <Box component="span" className="pill">
            Scoring: {s.scoringStrategy}
          </Box>
          <Box component="span" className="pill">
            Allocation: {allocationLabel(s.allocationStrategy)}
          </Box>
        </Group>
        {leagueIdForBackLink ? (
          <Group className="inline-actions" wrap="wrap">
            <Button
              component={Link}
              to={`/leagues/${leagueIdForBackLink}`}
              variant="subtle"
            >
              Back to league
            </Button>
          </Group>
        ) : null}
      </Group>
      {s.canEdit && <FormStatus loading={s.working} result={s.cancelResult} />}

      {s.isArchived && (
        <Box className="status status-info" role="status">
          Archived season: roster, invites, and scoring are locked. Draft room and
          standings remain view-only year-round.
        </Box>
      )}

      <Card className="card nested" component="section" mt="md">
        <Group
          className="header-with-controls"
          justify="space-between"
          align="start"
          wrap="wrap"
        >
          <Box>
            <Title order={3}>Draft Room</Title>
            <Text className="muted">Join the live draft for this season.</Text>
          </Box>
          <Group className="inline-actions" wrap="wrap">
            {s.draftId ? (
              <Button component={Link} to={`/drafts/${s.draftId}`} variant="subtle">
                Enter draft room
              </Button>
            ) : s.canEdit ? (
              <Button
                type="button"
                onClick={() => void s.createDraft()}
                disabled={s.working}
              >
                Create draft
              </Button>
            ) : (
              <Box component="span" className="pill">
                Draft not created yet
              </Box>
            )}
          </Group>
        </Group>
        {s.isArchived && (
          <Text className="muted">
            Past season — draft actions are locked; results remain viewable.
          </Text>
        )}
        {!s.draftId && s.canEdit && (
          <FormStatus loading={s.working} result={s.draftCreateResult} />
        )}
        {s.integrityWarningActive && (
          <Box className="status status-warning" role="status">
            Heads up: once winners start getting entered after the ceremony begins,
            drafting stops immediately. If you are in the room then, it ends just like a
            cancellation.
          </Box>
        )}
        {s.leagueContext?.season?.draft_status && (
          <Text className="muted">
            Timer:{" "}
            {s.leagueContext.season.pick_timer_seconds
              ? `${s.leagueContext.season.pick_timer_seconds}s per pick (auto-pick: next available)`
              : "Off"}
          </Text>
        )}
        {s.ceremonyStartsAt && (
          <Text className="muted">
            Ceremony starts {s.formatDate(s.ceremonyStartsAt)} (warning window: 24h
            prior).
          </Text>
        )}
        {!s.draftId && (
          <Text className="muted">
            The commissioner will create the draft for this season.
          </Text>
        )}
      </Card>

      <Box className="grid two-col" mt="md">
        <Card className="card nested" component="section">
          <Group
            className="header-with-controls"
            justify="space-between"
            align="start"
            wrap="wrap"
          >
            <Box>
              <Title order={3}>Participants</Title>
              <Text className="muted">Season roster.</Text>
            </Box>
          </Group>
          {s.isArchived && (
            <Box className="status status-info" role="status">
              Roster locked (archived season).
            </Box>
          )}
          {s.members.length === 0 ? (
            <Text className="muted">No participants yet.</Text>
          ) : (
            <Stack component="ul" className="list">
              {s.members.map((m) => {
                const leagueProfile = s.leagueContext?.leagueMembers?.find(
                  (lm) => lm.user_id === m.user_id
                );
                return (
                  <Box key={m.user_id} component="li" className="list-row">
                    <Text span>
                      {m.username ?? leagueProfile?.username ?? `User ${m.user_id}`}
                    </Text>
                    <Box component="span" className="pill">
                      {m.role}
                    </Box>
                    {s.canEdit && m.role !== "OWNER" && (
                      <Button
                        type="button"
                        variant="subtle"
                        disabled={s.working}
                        onClick={() => void s.removeMember(m.user_id)}
                      >
                        Remove
                      </Button>
                    )}
                  </Box>
                );
              })}
            </Stack>
          )}
          {s.canEdit && (
            <>
              <Group className="inline-actions" wrap="wrap">
                <Select
                  aria-label="Select league member"
                  placeholder="Add league member..."
                  value={s.selectedLeagueMember || null}
                  onChange={(v) => s.setSelectedLeagueMember(v ?? "")}
                  data={s.availableLeagueMembers.map((lm) => ({
                    value: String(lm.user_id),
                    label: lm.username
                  }))}
                  disabled={s.working}
                />
                <Text className="muted" span>
                  or
                </Text>
                <TextInput
                  placeholder="Username…"
                  value={s.manualUsername}
                  onChange={(e) => s.setManualUsername(e.currentTarget.value)}
                  disabled={s.working}
                  aria-label="Username"
                />
                <Button
                  type="button"
                  onClick={() => void s.addMember()}
                  disabled={s.working}
                >
                  Add to season
                </Button>
              </Group>
              <Text className="muted">
                You can add anyone by username; if they aren&apos;t already a league
                member, they&apos;ll be added to the league automatically.
              </Text>
              <FormStatus loading={s.working} result={s.addMemberResult} />
            </>
          )}
        </Card>

        <Card className="card nested" component="section">
          <Group
            className="header-with-controls"
            justify="space-between"
            align="start"
            wrap="wrap"
          >
            <Box>
              <Title order={3}>Commissioner Controls</Title>
              <Text className="muted">Scoring + invites. Draft must be pending.</Text>
            </Box>
          </Group>
          {s.isArchived ? (
            <Text className="muted">
              Archived season — scoring and invites are read-only. No edits allowed.
            </Text>
          ) : (
            <Stack className="stack">
              <Group className="pill-list" wrap="wrap">
                <Box component="span" className="pill">
                  Scoring: {s.scoringStrategy}
                </Box>
                <Box component="span" className="pill">
                  Leftovers: {allocationLabel(s.allocationStrategy)}
                </Box>
              </Group>
              <Text className="muted">
                Scoring and leftovers are set when creating the season (editing coming
                later).
              </Text>

              <Group className="inline-form" wrap="wrap" align="flex-end">
                <TextInput
                  label="Username to invite"
                  name="username"
                  value={s.userInviteQuery}
                  onChange={(e) => s.setUserInviteQuery(e.currentTarget.value)}
                  disabled={!s.canEdit || s.working}
                />
                <Button
                  type="button"
                  onClick={() => void s.createUserInvite()}
                  disabled={!s.canEdit || s.working}
                >
                  Create invite
                </Button>
              </Group>
              <FormStatus loading={s.working} result={s.userInviteResult} />

              <Group className="inline-form" wrap="wrap" align="flex-end">
                <TextInput
                  label="Placeholder invite label"
                  name="label"
                  value={s.placeholderLabel}
                  onChange={(e) => s.setPlaceholderLabel(e.currentTarget.value)}
                  disabled={!s.canEdit || s.working}
                />
                <Button
                  type="button"
                  onClick={() => void s.createPlaceholderInvite()}
                  disabled={!s.canEdit || s.working}
                >
                  Generate link
                </Button>
              </Group>
              <FormStatus loading={s.working} result={s.inviteResult} />

              {s.invites.length === 0 ? (
                <Text className="muted">No invites created yet.</Text>
              ) : (
                <Stack className="list">
                  {s.invites.map((invite) => (
                    <Box key={invite.id} className="list-row">
                      <Box>
                        <Group className="pill-list" wrap="wrap">
                          <Box component="span" className="pill">
                            #{invite.id}
                          </Box>
                          <Box component="span" className="pill">
                            {invite.kind}
                          </Box>
                          <Box
                            component="span"
                            className={`pill ${invite.status === "REVOKED" ? "muted" : ""}`}
                          >
                            {invite.status}
                          </Box>
                        </Group>
                        <Text className="muted">{invite.label ?? "No label"}</Text>
                        <Text className="muted">{s.buildInviteLink(invite.id)}</Text>
                      </Box>
                      <Group className="pill-actions" wrap="wrap">
                        <Button
                          type="button"
                          onClick={() => s.copyLink(invite.id)}
                          disabled={s.working}
                        >
                          Copy link
                        </Button>
                        {invite.status !== "REVOKED" ? (
                          <Button
                            type="button"
                            variant="subtle"
                            onClick={() => void s.revokeInvite(invite.id)}
                            disabled={s.working}
                          >
                            Revoke
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="subtle"
                          onClick={() => void s.regenerateInvite(invite.id)}
                          disabled={s.working}
                        >
                          Regenerate
                        </Button>
                      </Group>
                    </Box>
                  ))}
                </Stack>
              )}
            </Stack>
          )}
        </Card>
      </Box>
    </Card>
  );
}
