import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Box,
  Button,
  Divider,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import { allocationLabel, scoringLabel } from "../../lib/labels";
import { PageLoader } from "../../ui/page-state";
import { CommissionerPill, StatusPill } from "../../ui/pills";
import "../../primitives/baseline.css";

export function SeasonScreen(props: {
  seasonIdLabel: string;
  leagueIdForBackLink?: number | null;
  view: ReturnType<typeof import("../../orchestration/seasons").useSeasonOrchestration>;
  onDeleteSeason: () => void | Promise<void>;
}) {
  const { seasonIdLabel, view: s, onDeleteSeason } = props;

  const [invitesOpen, setInvitesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [settingsDraft, setSettingsDraft] = useState<{
    scoringStrategy: "fixed" | "negative";
    allocationStrategy: "UNDRAFTED" | "FULL_POOL";
    timerEnabled: boolean;
    pickTimerSeconds: number;
  } | null>(null);

  const leagueName = s.leagueContext?.league?.name ?? null;
  const ceremonyId = s.leagueContext?.season?.ceremony_id ?? null;
  const ceremonyName =
    s.leagueContext?.season?.ceremony_name ??
    (ceremonyId ? `Ceremony ${ceremonyId}` : `Ceremony`);

  const progression = useMemo(() => {
    if (s.isArchived) return "Archived";
    const ds = String(s.draftStatus ?? "").toUpperCase();
    if (ds === "COMPLETED") return "Draft complete";
    if (ds === "IN_PROGRESS" || ds === "LIVE") return "Drafting";
    if (ds === "PAUSED") return "Paused";
    return "Pre-draft";
  }, [s.draftStatus, s.isArchived]);

  const isLocked = useMemo(() => {
    if (s.isArchived) return true;
    const ds = String(s.draftStatus ?? "").toUpperCase();
    return Boolean(ds && ds !== "PENDING");
  }, [s.draftStatus, s.isArchived]);

  const draftRoomCtaLabel = useMemo(() => {
    const cs = String(s.ceremonyStatus ?? "").toUpperCase();
    if (cs === "COMPLETE" || cs === "ARCHIVED") return "View results";

    const ds = String(s.draftStatus ?? "").toUpperCase();
    if (ds === "COMPLETED") return "View draft results";

    // PENDING / IN_PROGRESS / LIVE / PAUSED (and other pre-complete states)
    return "Enter draft room";
  }, [s.ceremonyStatus, s.draftStatus]);

  const draftDefaults = useMemo(() => {
    const scoring = (s.scoringStrategy ?? "fixed") as "fixed" | "negative";
    const allocation = (s.allocationStrategy ?? "UNDRAFTED") as "UNDRAFTED" | "FULL_POOL";
    const timerEnabled = Boolean(s.leagueContext?.season?.pick_timer_seconds);
    const pickTimerSeconds = s.leagueContext?.season?.pick_timer_seconds
      ? Number(s.leagueContext.season.pick_timer_seconds)
      : 60;

    return { scoring, allocation, timerEnabled, pickTimerSeconds };
  }, [
    s.scoringStrategy,
    s.allocationStrategy,
    s.leagueContext?.season?.pick_timer_seconds
  ]);

  if (s.loading) return <PageLoader label="Loading season..." />;
  if (s.error) {
    return (
      <Box className="baseline-page">
        <Box className="baseline-pageInner">
          <Stack component="section" gap="md">
            <Box component="header">
              <Title order={2} className="baseline-textHeroTitle">
                Season {seasonIdLabel}
              </Title>
              <Text className="baseline-textBody">Could not load season data.</Text>
            </Box>
            <Box className="status status-error">{s.error}</Box>
          </Stack>
        </Box>
      </Box>
    );
  }

  return (
    <Box className="baseline-page">
      <Box className="baseline-pageInner">
        <Stack component="section" gap="md">
          {/* Full-width header */}
          <Group
            component="header"
            justify="space-between"
            align="flex-start"
            wrap="wrap"
          >
            <Box>
              <Title order={2} className="baseline-textHeroTitle">
                {ceremonyName}
              </Title>
              <Text className="baseline-textBody">{leagueName ?? "—"}</Text>
            </Box>
            <StatusPill>{progression.toUpperCase()}</StatusPill>
          </Group>

          {/* Three-column functional layout */}
          <Box
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)",
              gap: 18,
              alignItems: "start"
            }}
          >
            {/* Column 1: Rules */}
            <Stack gap="sm">
              <Title order={3}>Rules</Title>
              <Divider />
              <Stack gap={6}>
                <Text>
                  <Text component="span" className="muted">
                    Scoring:
                  </Text>{" "}
                  {scoringLabel(s.scoringStrategy)}
                </Text>
                <Text>
                  <Text component="span" className="muted">
                    Allocation:
                  </Text>{" "}
                  {allocationLabel(s.allocationStrategy)}
                </Text>
                <Text>
                  <Text component="span" className="muted">
                    Draft timer:
                  </Text>{" "}
                  {s.leagueContext?.season?.pick_timer_seconds
                    ? `${s.leagueContext.season.pick_timer_seconds}s`
                    : "Off"}
                </Text>
                <Text>
                  <Text component="span" className="muted">
                    Ceremony time:
                  </Text>{" "}
                  {s.formatDate(s.ceremonyStartsAt)}
                </Text>
              </Stack>
            </Stack>

            {/* Column 2: Participants */}
            <Stack gap="sm">
              <Title order={3}>Participants</Title>
              <Divider />
              {s.members.length === 0 ? (
                <Text className="muted">No participants.</Text>
              ) : (
                <Stack
                  component="ul"
                  gap="xs"
                  style={{ listStyle: "none", margin: 0, padding: 0 }}
                >
                  {s.members.map((m) => (
                    <Group
                      key={m.id}
                      justify="space-between"
                      align="center"
                      wrap="nowrap"
                    >
                      <Text>{m.username ?? `User ${m.user_id}`}</Text>
                      {m.role === "OWNER" ? <CommissionerPill /> : null}
                    </Group>
                  ))}
                </Stack>
              )}
            </Stack>

            {/* Column 3: Draft room */}
            <Stack gap="sm">
              <Title order={3}>Draft room</Title>
              <Divider />
              <Group wrap="wrap">
                {s.draftId ? (
                  <Button component={Link} to={`/drafts/${s.draftId}`} variant="filled">
                    {draftRoomCtaLabel}
                  </Button>
                ) : (
                  <Button disabled variant="filled">
                    {draftRoomCtaLabel}
                  </Button>
                )}
                {ceremonyId ? (
                  <Button
                    component={Link}
                    to={`/ceremonies/${ceremonyId}/draft-plans`}
                    variant="subtle"
                  >
                    Draft plans
                  </Button>
                ) : (
                  <Button disabled variant="subtle">
                    Draft plans
                  </Button>
                )}
              </Group>
            </Stack>
          </Box>

          {/* Season management aligned under the Draft room column */}
          {s.canEdit ? (
            <Box
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)",
                gap: 18,
                alignItems: "start"
              }}
            >
              <Box />
              <Box />
              <Stack gap="sm">
                <Title order={3} className="baseline-textSectionHeader">
                  Season management
                </Title>
                <Stack gap="xs">
                  <Button
                    variant="outline"
                    onClick={() => setInvitesOpen(true)}
                    disabled={isLocked}
                    title={
                      isLocked ? "Invites are locked once drafting starts" : undefined
                    }
                  >
                    Manage invites
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSettingsDraft({
                        scoringStrategy: draftDefaults.scoring,
                        allocationStrategy: draftDefaults.allocation,
                        timerEnabled: draftDefaults.timerEnabled,
                        pickTimerSeconds: draftDefaults.pickTimerSeconds
                      });
                      setSettingsOpen(true);
                    }}
                    disabled={isLocked}
                    title={
                      isLocked
                        ? "Draft settings are locked once drafting starts"
                        : undefined
                    }
                  >
                    Adjust draft settings
                  </Button>
                </Stack>
                <Divider my="sm" />
                <Title order={4} className="baseline-textSectionHeader">
                  Danger zone
                </Title>
                <Button
                  color="red"
                  variant="outline"
                  onClick={() => setDeleteOpen(true)}
                  disabled={s.working}
                >
                  Delete season
                </Button>
              </Stack>
            </Box>
          ) : null}

          {/* Modals */}
          <Modal
            opened={invitesOpen}
            onClose={() => setInvitesOpen(false)}
            title="Manage invites"
            centered
          >
            <Stack gap="md">
              <Group className="inline-form" wrap="wrap" align="flex-end">
                <TextInput
                  label="Username to invite"
                  name="username"
                  value={s.userInviteQuery}
                  onChange={(e) => s.setUserInviteQuery(e.currentTarget.value)}
                  disabled={!s.canEdit || s.working || isLocked}
                />
                <Button
                  type="button"
                  onClick={() => void s.createUserInvite()}
                  disabled={!s.canEdit || s.working || isLocked}
                >
                  Create invite
                </Button>
              </Group>

              <Group className="inline-form" wrap="wrap" align="flex-end">
                <TextInput
                  label="Placeholder invite label"
                  name="label"
                  value={s.placeholderLabel}
                  onChange={(e) => s.setPlaceholderLabel(e.currentTarget.value)}
                  disabled={!s.canEdit || s.working || isLocked}
                />
                <Button
                  type="button"
                  onClick={() => void s.createPlaceholderInvite()}
                  disabled={!s.canEdit || s.working || isLocked}
                >
                  Generate link
                </Button>
              </Group>

              {s.invites.length === 0 ? (
                <Text className="muted">No invites created yet.</Text>
              ) : (
                <Stack className="list" gap="sm">
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
          </Modal>

          <Modal
            opened={settingsOpen}
            onClose={() => {
              setSettingsOpen(false);
              setSettingsDraft(null);
            }}
            title="Adjust draft settings"
            centered
          >
            <Stack gap="md">
              <Select
                label="Scoring"
                value={
                  (settingsDraft?.scoringStrategy ?? draftDefaults.scoring) as string
                }
                onChange={(v) => {
                  const next = (v ?? "fixed") as "fixed" | "negative";
                  setSettingsDraft((p) => ({
                    scoringStrategy: next,
                    allocationStrategy: (p?.allocationStrategy ??
                      draftDefaults.allocation) as "UNDRAFTED" | "FULL_POOL",
                    timerEnabled: p?.timerEnabled ?? draftDefaults.timerEnabled,
                    pickTimerSeconds:
                      p?.pickTimerSeconds ?? draftDefaults.pickTimerSeconds
                  }));
                }}
                disabled={!s.canEdit || s.working || isLocked}
                data={[
                  { value: "fixed", label: "Standard" },
                  { value: "negative", label: "Negative" }
                ]}
              />

              <Select
                label="Allocation"
                value={
                  (settingsDraft?.allocationStrategy ??
                    draftDefaults.allocation) as string
                }
                onChange={(v) => {
                  const next = (v ?? "UNDRAFTED") as "UNDRAFTED" | "FULL_POOL";
                  setSettingsDraft((p) => ({
                    scoringStrategy: (p?.scoringStrategy ?? draftDefaults.scoring) as
                      | "fixed"
                      | "negative",
                    allocationStrategy: next,
                    timerEnabled: p?.timerEnabled ?? draftDefaults.timerEnabled,
                    pickTimerSeconds:
                      p?.pickTimerSeconds ?? draftDefaults.pickTimerSeconds
                  }));
                }}
                disabled={!s.canEdit || s.working || isLocked}
                data={[
                  { value: "UNDRAFTED", label: "Leave extras undrafted" },
                  { value: "FULL_POOL", label: "Use full pool (extras drafted)" }
                ]}
              />

              <Group className="inline-form" wrap="wrap" align="flex-end">
                <Switch
                  label="Pick timer"
                  checked={settingsDraft?.timerEnabled ?? draftDefaults.timerEnabled}
                  onChange={(e) => {
                    const next = e.currentTarget.checked;
                    setSettingsDraft((p) => ({
                      scoringStrategy: (p?.scoringStrategy ?? draftDefaults.scoring) as
                        | "fixed"
                        | "negative",
                      allocationStrategy: (p?.allocationStrategy ??
                        draftDefaults.allocation) as "UNDRAFTED" | "FULL_POOL",
                      timerEnabled: next,
                      pickTimerSeconds:
                        p?.pickTimerSeconds ?? draftDefaults.pickTimerSeconds
                    }));
                  }}
                  disabled={!s.canEdit || s.working || isLocked}
                />
                <NumberInput
                  label="Seconds per pick"
                  value={
                    settingsDraft?.pickTimerSeconds ?? draftDefaults.pickTimerSeconds
                  }
                  onChange={(v) => {
                    const next = Number(v) || 0;
                    setSettingsDraft((p) => ({
                      scoringStrategy: (p?.scoringStrategy ?? draftDefaults.scoring) as
                        | "fixed"
                        | "negative",
                      allocationStrategy: (p?.allocationStrategy ??
                        draftDefaults.allocation) as "UNDRAFTED" | "FULL_POOL",
                      timerEnabled: p?.timerEnabled ?? draftDefaults.timerEnabled,
                      pickTimerSeconds: next
                    }));
                  }}
                  min={0}
                  step={5}
                  disabled={
                    !s.canEdit ||
                    s.working ||
                    isLocked ||
                    !(settingsDraft?.timerEnabled ?? draftDefaults.timerEnabled)
                  }
                />
              </Group>

              <Group justify="flex-end" wrap="wrap">
                <Button
                  type="button"
                  variant="subtle"
                  onClick={() => {
                    setSettingsOpen(false);
                    setSettingsDraft(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={async () => {
                    const draft = settingsDraft ?? {
                      scoringStrategy: draftDefaults.scoring,
                      allocationStrategy: draftDefaults.allocation,
                      timerEnabled: draftDefaults.timerEnabled,
                      pickTimerSeconds: draftDefaults.pickTimerSeconds
                    };

                    const nextTimerSeconds = draft.timerEnabled
                      ? draft.pickTimerSeconds
                      : null;

                    const dirty =
                      draft.scoringStrategy !== draftDefaults.scoring ||
                      draft.allocationStrategy !== draftDefaults.allocation ||
                      (draftDefaults.timerEnabled
                        ? draftDefaults.pickTimerSeconds
                        : null) !== nextTimerSeconds;

                    if (!dirty) {
                      setSettingsOpen(false);
                      setSettingsDraft(null);
                      return;
                    }

                    if (draft.scoringStrategy !== draftDefaults.scoring) {
                      await s.updateScoring(draft.scoringStrategy);
                    }
                    if (draft.allocationStrategy !== draftDefaults.allocation) {
                      await s.updateAllocation(draft.allocationStrategy);
                    }
                    await s.updateTimerWith(nextTimerSeconds);

                    setSettingsOpen(false);
                    setSettingsDraft(null);
                  }}
                  disabled={!s.canEdit || s.working || isLocked}
                >
                  Save
                </Button>
              </Group>
            </Stack>
          </Modal>

          <Modal
            opened={deleteOpen}
            onClose={() => setDeleteOpen(false)}
            title="Delete season?"
            centered
          >
            <Stack gap="md">
              <Text>
                Delete this season? This cancels the season and blocks drafting. This
                cannot be undone.
              </Text>
              <Group justify="flex-end">
                <Button variant="subtle" onClick={() => setDeleteOpen(false)}>
                  Cancel
                </Button>
                <Button
                  color="red"
                  onClick={() => {
                    setDeleteOpen(false);
                    void onDeleteSeason();
                  }}
                  disabled={s.working}
                >
                  Delete season
                </Button>
              </Group>
            </Stack>
          </Modal>
        </Stack>
      </Box>
    </Box>
  );
}
