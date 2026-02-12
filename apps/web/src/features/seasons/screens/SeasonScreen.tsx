import { useMemo, useState } from "react";
import { Box, Stack, Text, Title } from "@ui";
import { allocationLabel, scoringLabel } from "@/lib/labels";
import { PageLoader } from "@/shared/page-state";
import { SeasonDashboardHeader } from "@/features/seasons/ui/SeasonDashboardHeader";
import { SeasonDraftRoomColumn } from "@/features/seasons/ui/SeasonDraftRoomColumn";
import { SeasonManagementColumn } from "@/features/seasons/ui/SeasonManagementColumn";
import { SeasonParticipantsColumn } from "@/features/seasons/ui/SeasonParticipantsColumn";
import { SeasonRulesColumn } from "@/features/seasons/ui/SeasonRulesColumn";
import {
  computeSeasonDraftRoomCtaLabel,
  computeSeasonLocked,
  computeSeasonProgression
} from "@/decisions/season";
import { SeasonInvitesModal } from "@/features/seasons/ui/modals/SeasonInvitesModal";
import { SeasonDraftSettingsModal } from "@/features/seasons/ui/modals/SeasonDraftSettingsModal";
import { SeasonCategoryWeightsModal } from "@/features/seasons/ui/modals/SeasonCategoryWeightsModal";
import { DeleteSeasonModal } from "@/features/seasons/ui/modals/DeleteSeasonModal";
import { useSeasonCategoryWeightsModal } from "./useSeasonCategoryWeightsModal";
import { useSeasonDraftSettingsModal } from "./useSeasonDraftSettingsModal";
import "@/primitives/baseline.css";

export function SeasonScreen(props: {
  seasonIdLabel: string;
  leagueIdForBackLink?: number | null;
  view: ReturnType<typeof import("@/orchestration/seasons").useSeasonOrchestration>;
  onDeleteSeason: () => void | Promise<void>;
}) {
  const { seasonIdLabel, view: s, onDeleteSeason } = props;

  const [invitesOpen, setInvitesOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const leagueName = s.leagueContext?.league?.name ?? null;
  const ceremonyId = s.leagueContext?.season?.ceremony_id ?? null;
  const ceremonyName =
    s.leagueContext?.season?.ceremony_name ??
    s.leagueContext?.season?.ceremony_code ??
    (ceremonyId ? `Ceremony ${ceremonyId}` : `Ceremony`);

  const progression = useMemo(
    () =>
      computeSeasonProgression({ isArchived: s.isArchived, draftStatus: s.draftStatus }),
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

  const weights = useSeasonCategoryWeightsModal({
    ceremonyId,
    getCeremonyCategoriesForWeights: s.getCeremonyCategoriesForWeights,
    existingWeights: s.leagueContext?.season?.category_weights ?? null
  });

  const settings = useSeasonDraftSettingsModal({
    scoringStrategy: s.scoringStrategy,
    allocationStrategy: s.allocationStrategy,
    pickTimerSeconds: s.leagueContext?.season?.pick_timer_seconds
      ? Number(s.leagueContext.season.pick_timer_seconds)
      : null,
    updateScoring: s.updateScoring,
    updateAllocation: s.updateAllocation,
    updateTimerWith: s.updateTimerWith
  });

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
                onOpenDraftSettings={settings.openSettingsModal}
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
            opened={settings.settingsOpen}
            onClose={() => settings.setSettingsOpen(false)}
            canEdit={Boolean(s.canEdit)}
            working={Boolean(s.working)}
            locked={Boolean(isLocked)}
            ceremonyId={ceremonyId}
            weightsLoading={weights.weightsLoading}
            draftDefaults={settings.draftDefaults}
            settingsDraft={settings.settingsDraft}
            setSettingsDraft={settings.setSettingsDraft}
            onOpenWeights={weights.openWeightsModal}
            onSave={settings.saveDraftSettings}
          />

          <SeasonCategoryWeightsModal
            opened={weights.weightsOpen}
            onClose={() => weights.setWeightsOpen(false)}
            locked={Boolean(isLocked)}
            canEdit={Boolean(s.canEdit)}
            working={Boolean(s.working)}
            error={weights.weightsError}
            categories={weights.weightsCats}
            weights={weights.weightsDraft}
            setWeights={weights.setWeightsDraft}
            onSave={async (nextWeights) => {
              await s.updateScoring("category_weighted", {
                categoryWeights: nextWeights
              });
              weights.setWeightsOpen(false);
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
