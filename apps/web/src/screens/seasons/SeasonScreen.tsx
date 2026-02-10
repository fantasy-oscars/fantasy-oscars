import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Box,
  Button,
  Divider,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { allocationLabel, scoringLabel } from "../../lib/labels";
import { PageLoader } from "../../ui/page-state";
import { CommissionerPill, StatusPill } from "../../ui/pills";
import {
  computeSeasonDraftRoomCtaLabel,
  computeSeasonLocked,
  computeSeasonProgression
} from "../../decisions/season";
import { SeasonInvitesModal } from "../../ui/seasons/modals/SeasonInvitesModal";
import {
  SeasonDraftSettingsModal,
  type SeasonDraftSettingsDraft
} from "../../ui/seasons/modals/SeasonDraftSettingsModal";
import { SeasonCategoryWeightsModal } from "../../ui/seasons/modals/SeasonCategoryWeightsModal";
import { DeleteSeasonModal } from "../../ui/seasons/modals/DeleteSeasonModal";
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

  const [settingsDraft, setSettingsDraft] = useState<SeasonDraftSettingsDraft | null>(
    null
  );

  const [weightsOpen, setWeightsOpen] = useState(false);
  const [weightsLoading, setWeightsLoading] = useState(false);
  const [weightsError, setWeightsError] = useState<string | null>(null);
  const [weightsCats, setWeightsCats] = useState<Array<{ id: number; name: string }>>([]);
  const [weightsDraft, setWeightsDraft] = useState<Record<string, number>>({});

  const leagueName = s.leagueContext?.league?.name ?? null;
  const ceremonyId = s.leagueContext?.season?.ceremony_id ?? null;
  const ceremonyName =
    s.leagueContext?.season?.ceremony_name ??
    s.leagueContext?.season?.ceremony_code ??
    (ceremonyId ? `Ceremony ${ceremonyId}` : `Ceremony`);

  const progression = useMemo(
    () => computeSeasonProgression({ isArchived: s.isArchived, draftStatus: s.draftStatus }),
    [s.draftStatus, s.isArchived]
  );

  const isLocked = useMemo(
    () => computeSeasonLocked({ isArchived: s.isArchived, draftStatus: s.draftStatus }),
    [s.draftStatus, s.isArchived]
  );

  const draftRoomCtaLabel = useMemo(
    () =>
      computeSeasonDraftRoomCtaLabel({
        ceremonyStatus: s.ceremonyStatus,
        draftStatus: s.draftStatus
      }),
    [s.ceremonyStatus, s.draftStatus]
  );

  const draftDefaults = useMemo(() => {
    const scoring = (s.scoringStrategy ?? "fixed") as
      | "fixed"
      | "negative"
      | "category_weighted";
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

  async function openWeightsModal() {
    if (!ceremonyId) return;
    setWeightsError(null);
    setWeightsLoading(true);
    const res = await s.getCeremonyCategoriesForWeights(ceremonyId);
    setWeightsLoading(false);
    if (!res.ok) {
      setWeightsError(res.error ?? "Unable to load categories");
      setWeightsCats([]);
      setWeightsDraft({});
      setWeightsOpen(true);
      return;
    }

    const cats = (res.categories ?? [])
      .slice()
      .sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0))
      .map((c) => ({ id: c.id, name: c.family_name }));
    const existing =
      (s.leagueContext?.season?.category_weights &&
      typeof s.leagueContext.season.category_weights === "object"
        ? s.leagueContext.season.category_weights
        : null) ?? null;
    const nextWeights: Record<string, number> = {};
    for (const c of cats) {
      const v = existing?.[String(c.id)];
      nextWeights[String(c.id)] = typeof v === "number" && Number.isInteger(v) ? v : 1;
    }

    setWeightsCats(cats);
    setWeightsDraft(nextWeights);
    setWeightsOpen(true);
  }

  async function saveDraftSettings(draft: SeasonDraftSettingsDraft) {
    const nextTimerSeconds = draft.timerEnabled ? draft.pickTimerSeconds : null;

    const dirty =
      draft.scoringStrategy !== draftDefaults.scoring ||
      draft.allocationStrategy !== draftDefaults.allocation ||
      (draftDefaults.timerEnabled ? draftDefaults.pickTimerSeconds : null) !==
        nextTimerSeconds;

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
  }

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
          <Box className="baseline-grid3Equal">
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
                    <Box key={m.id} component="li">
                      <Group justify="space-between" align="center" wrap="wrap">
                        <Text>{m.username ?? `User ${m.user_id}`}</Text>
                        {m.role === "OWNER" ? <CommissionerPill /> : null}
                      </Group>
                    </Box>
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
            <Box className="baseline-grid3Equal">
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
          <SeasonInvitesModal
            opened={invitesOpen}
            onClose={() => setInvitesOpen(false)}
            canEdit={Boolean(s.canEdit)}
            working={Boolean(s.working)}
            locked={Boolean(isLocked)}
            userInviteQuery={s.userInviteQuery}
            userInviteSearching={Boolean(s.userInviteSearching)}
            userInviteMatches={s.userInviteMatches.map((u) => ({
              id: u.id,
              username: u.username
            }))}
            onChangeUserInviteQuery={(next) => s.setUserInviteQuery(next)}
            onPickUserInvitee={(id, username) => {
              s.setUserInviteSelectedUserId(id);
              s.setUserInviteQuery(username);
            }}
            onCreateUserInvite={() => void s.createUserInvite()}
            placeholderLabel={s.placeholderLabel}
            onChangePlaceholderLabel={(next) => s.setPlaceholderLabel(next)}
            onCreatePlaceholderInvite={() => void s.createPlaceholderInvite()}
            invites={s.invites}
            buildInviteLink={(id) => s.buildInviteLink(id)}
            onCopyLink={(id) => s.copyLink(id)}
            onRevokeInvite={(id) => void s.revokeInvite(id)}
            onRegenerateInvite={(id) => void s.regenerateInvite(id)}
          />

          <SeasonDraftSettingsModal
            opened={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            canEdit={Boolean(s.canEdit)}
            working={Boolean(s.working)}
            locked={Boolean(isLocked)}
            ceremonyId={ceremonyId}
            weightsLoading={weightsLoading}
            draftDefaults={draftDefaults}
            settingsDraft={settingsDraft}
            setSettingsDraft={setSettingsDraft}
            onOpenWeights={openWeightsModal}
            onSave={saveDraftSettings}
          />

          <SeasonCategoryWeightsModal
            opened={weightsOpen}
            onClose={() => setWeightsOpen(false)}
            locked={Boolean(isLocked)}
            canEdit={Boolean(s.canEdit)}
            working={Boolean(s.working)}
            error={weightsError}
            categories={weightsCats}
            weights={weightsDraft}
            setWeights={setWeightsDraft}
            onSave={async (weights) => {
              await s.updateScoring("category_weighted", { categoryWeights: weights });
              setWeightsOpen(false);
            }}
          />

          <DeleteSeasonModal
            opened={deleteOpen}
            onClose={() => setDeleteOpen(false)}
            working={Boolean(s.working)}
            onConfirm={() => {
              setDeleteOpen(false);
              void onDeleteSeason();
            }}
          />
        </Stack>
      </Box>
    </Box>
  );
}
