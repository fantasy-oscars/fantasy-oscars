import { useMemo, useState } from "react";
import { Box, Stack, Text, Title } from "@mantine/core";
import { allocationLabel, scoringLabel } from "../../lib/labels";
import { PageLoader } from "../../ui/page-state";
import { SeasonDashboardHeader } from "../../ui/seasons/SeasonDashboardHeader";
import { SeasonDraftRoomColumn } from "../../ui/seasons/SeasonDraftRoomColumn";
import { SeasonManagementColumn } from "../../ui/seasons/SeasonManagementColumn";
import { SeasonParticipantsColumn } from "../../ui/seasons/SeasonParticipantsColumn";
import { SeasonRulesColumn } from "../../ui/seasons/SeasonRulesColumn";
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
          <SeasonDashboardHeader
            title={ceremonyName}
            subtitle={leagueName ?? "—"}
            statusLabel={progression.toUpperCase()}
          />

          {/* Three-column functional layout */}
          <Box className="baseline-grid3Equal">
            {/* Column 1: Rules */}
            <SeasonRulesColumn
              scoringLabel={scoringLabel(s.scoringStrategy)}
              allocationLabel={allocationLabel(s.allocationStrategy)}
              draftTimerLabel={
                s.leagueContext?.season?.pick_timer_seconds
                  ? `${s.leagueContext.season.pick_timer_seconds}s`
                  : "Off"
              }
              ceremonyTimeLabel={s.formatDate(s.ceremonyStartsAt)}
            />

            {/* Column 2: Participants */}
            <SeasonParticipantsColumn members={s.members} />

            {/* Column 3: Draft room */}
            <SeasonDraftRoomColumn
              draftId={s.draftId ?? null}
              ceremonyId={ceremonyId}
              draftRoomCtaLabel={draftRoomCtaLabel}
            />
          </Box>

          {/* Season management aligned under the Draft room column */}
          {s.canEdit ? (
            <Box className="baseline-grid3Equal">
              <Box />
              <Box />
              <SeasonManagementColumn
                isLocked={isLocked}
                working={Boolean(s.working)}
                onOpenInvites={() => setInvitesOpen(true)}
                onOpenDraftSettings={() => {
                  setSettingsDraft({
                    scoringStrategy: draftDefaults.scoring,
                    allocationStrategy: draftDefaults.allocation,
                    timerEnabled: draftDefaults.timerEnabled,
                    pickTimerSeconds: draftDefaults.pickTimerSeconds
                  });
                  setSettingsOpen(true);
                }}
                onOpenDelete={() => setDeleteOpen(true)}
              />
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
