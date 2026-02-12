import { ActionIcon, Box, Button, Group, Modal, Stack, Text, UnstyledButton } from "@ui";
import { useState } from "react";
import type { DraftRoomOrchestration } from "@/orchestration/draft";
import { RuntimeBannerStack } from "@/notifications";
import { SiteFooterFineprintOnly } from "@/app/layouts/SiteFooter";
import { NomineeTooltipCard } from "@/features/draft/components/NomineeTooltipCard";
import { CategoryCard } from "@/features/draft/ui/CategoryCard";
import { MobileDraftHeader } from "./MobileDraftHeader";
import { MobileRail } from "@/features/draft/ui/mobile/MobileRail";
import { MobileRosterBoard } from "./MobileRosterBoard";
import {
  FO_MODAL_OVERLAY_BLUR_PX,
  FO_MODAL_OVERLAY_OPACITY
} from "@/tokens/overlays";

type DraftAudioController =
  ReturnType<typeof import("@/lib/draftAudio").createDraftAudioController>;

export function MobileDraftRoom(props: {
  o: DraftRoomOrchestration;
  isPreview: boolean;
  isPre: boolean;
  isPaused: boolean;
  isCompleted: boolean;
  isFinalResults: boolean;
  isMyTurnStyling: boolean;
  isMyTurn: boolean;
  previewUser: { label: string; avatarKey: string | null };
  audioController: DraftAudioController | null;
  audioUnlocked: boolean;
  categories: Array<{
    id: string;
    title: string;
    icon: string;
    iconVariant: "default" | "inverted";
    unitKind: string;
    weightText: string | null;
    nominees: Array<{
      id: string;
      label: string;
      muted: boolean;
      winner: boolean;
      posterUrl: string | null;
      filmTitle: string | null;
      filmYear: number | null;
      contributors: string[];
      songTitle: string | null;
      performerName: string | null;
      performerCharacter: string | null;
      performerProfileUrl: string | null;
      performerProfilePath: string | null;
    }>;
  }>;
  nomineeById: Map<
    number,
    {
      unitKind: string;
      categoryName: string;
      filmTitle: string | null;
      filmYear: number | null;
      filmPosterUrl: string | null;
      contributors: string[];
      performerName: string | null;
      performerCharacter: string | null;
      performerProfileUrl: string | null;
      performerProfilePath: string | null;
      songTitle: string | null;
      categoryIcon: string;
      categoryIconVariant: "default" | "inverted";
    }
  >;
  draftedNominationIds: Set<number>;
  avatarKeyBySeat: Map<number, string | null>;
  canDraftAction: boolean;
  showDrafted: boolean;
  onToggleShowDrafted: (next: boolean) => void;
  showDraftedVisible: boolean;
  themeIcon: string;
  onToggleTheme: () => void;
}) {
  const { o } = props;
  const draftStatus = o.header.status ?? null;
  const isCompleted = props.isCompleted;

  const [menuOpen, setMenuOpen] = useState(false);
  const [activeRail, setActiveRail] = useState<"ledger" | "roster" | "autodraft" | null>(
    null
  );

  const [mobileNominationId, setMobileNominationId] = useState<number | null>(null);

  const hideEmptyCategories = o.header.poolMode === "UNDRAFTED_ONLY";
  const categoriesForList = hideEmptyCategories
    ? props.categories.filter((c) => c.nominees.length > 0)
    : props.categories;

  const mobileNominee =
    mobileNominationId != null
      ? (props.nomineeById.get(mobileNominationId) ?? null)
      : null;

  const closeNomineeCard = () => {
    setMobileNominationId(null);
    o.myRoster.clearSelection();
  };

  const openNomineeCard = (id: number) => {
    o.pool.onSelectNomination(id);
    setMobileNominationId(id);
  };

  const canOpenLedger = !props.isPre && !isCompleted;
  const canOpenRosterRail = !props.isPre && !isCompleted;
  const canOpenAutodraft = !isCompleted;

  return (
    <Box
      className="dr-frame"
      data-screen="draft-room"
      data-turn={props.isMyTurnStyling ? "mine" : "theirs"}
      data-results={props.isFinalResults ? "final" : "live"}
      data-mobile="true"
    >
      <MobileDraftHeader
        open={menuOpen}
        onOpen={() => setMenuOpen(true)}
        onClose={() => setMenuOpen(false)}
        backHref="/seasons"
        participants={o.header.participants}
        direction={o.header.direction}
        roundNumber={o.header.roundNumber}
        pickNumber={o.header.pickNumber}
        isTimerDraft={o.header.hasTimer}
        timerRemainingMs={o.header.timerRemainingMs}
        clockText={o.header.clockText}
        draftStatus={draftStatus}
        isMyTurn={props.isMyTurn}
        audioController={props.audioController}
        audioUnlocked={props.audioUnlocked}
        showDraftControls={!isCompleted}
        canManageDraft={props.isPreview ? true : o.header.canManageDraft}
        onStartDraft={o.header.onStartDraft}
        onPauseDraft={o.header.onPauseDraft}
        onResumeDraft={o.header.onResumeDraft}
        isFinalResults={props.isFinalResults}
        resultsWinnerLabel={o.header.resultsWinnerLabel}
        view={props.isPre ? "draft" : isCompleted ? "roster" : o.header.view}
        onViewChange={(v) => o.header.setView(v)}
        canToggleView={o.header.canToggleView && !props.isPre && !isCompleted}
        showDrafted={props.showDrafted}
        onToggleShowDrafted={props.onToggleShowDrafted}
        showDraftedVisible={props.showDraftedVisible}
        themeIcon={props.themeIcon}
        onToggleTheme={props.onToggleTheme}
        userLabel={props.previewUser.label}
        userAvatarKey={props.previewUser.avatarKey}
      />

      <RuntimeBannerStack />

      <Box className="dr-body">
        <Box className="dr-mobileScroll">
          {isCompleted || o.header.view === "roster" ? (
            <MobileRosterBoard o={o} nomineeById={props.nomineeById} />
          ) : activeRail ? (
            <MobileRail
              rail={activeRail}
              o={o}
              avatarKeyBySeat={props.avatarKeyBySeat}
              nomineeById={props.nomineeById}
              draftedNominationIds={props.draftedNominationIds}
            />
          ) : (
            <Stack gap="sm" className="dr-mobileCategories">
              {categoriesForList.map((c) => (
                <CategoryCard
                  key={c.id}
                  categoryId={c.id}
                  title={c.title}
                  icon={c.icon}
                  iconVariant={c.iconVariant}
                  unitKind={c.unitKind}
                  tooltipsEnabled={false}
                  weightText={c.weightText}
                  nominees={c.nominees}
                  firstPillRef={null}
                  isKeyboardMode={false}
                  setKeyboardMode={() => {}}
                  canDraftAction={props.canDraftAction}
                  onNomineeClick={(id) => openNomineeCard(id)}
                  onNomineeDoubleClick={() => {}}
                />
              ))}
            </Stack>
          )}
        </Box>
      </Box>

      {!isCompleted && o.header.view !== "roster" ? (
        <Box className="dr-mobileBottomBar" role="navigation" aria-label="Draft rails">
          <Group justify="space-between" gap="var(--fo-space-0)" wrap="nowrap">
            <UnstyledButton
              type="button"
              className={[
                "dr-mobileRailBtn",
                activeRail === "ledger" ? "is-active" : "",
                canOpenLedger ? "" : "is-disabled"
              ].join(" ")}
              aria-label="Draft history"
              onClick={() => {
                if (!canOpenLedger) return;
                setActiveRail((r) => (r === "ledger" ? null : "ledger"));
              }}
            >
              <Text component="span" className="mi-icon" aria-hidden="true">
                history
              </Text>
            </UnstyledButton>
            <UnstyledButton
              type="button"
              className={[
                "dr-mobileRailBtn",
                activeRail === "roster" ? "is-active" : "",
                canOpenRosterRail ? "" : "is-disabled"
              ].join(" ")}
              aria-label="My roster"
              onClick={() => {
                if (!canOpenRosterRail) return;
                setActiveRail((r) => (r === "roster" ? null : "roster"));
              }}
            >
              <Text component="span" className="mi-icon" aria-hidden="true">
                patient_list
              </Text>
            </UnstyledButton>
            <UnstyledButton
              type="button"
              className={[
                "dr-mobileRailBtn",
                activeRail === "autodraft" ? "is-active" : "",
                canOpenAutodraft ? "" : "is-disabled"
              ].join(" ")}
              aria-label="Auto-draft"
              onClick={() => {
                if (!canOpenAutodraft) return;
                setActiveRail((r) => (r === "autodraft" ? null : "autodraft"));
              }}
            >
              <Text component="span" className="mi-icon" aria-hidden="true">
                smart_toy
              </Text>
            </UnstyledButton>
          </Group>
        </Box>
      ) : null}

      <Box className="dr-footer">
        <SiteFooterFineprintOnly />
      </Box>

      <Modal
        opened={mobileNominationId != null}
        onClose={closeNomineeCard}
        centered
        withCloseButton={false}
        overlayProps={{ opacity: FO_MODAL_OVERLAY_OPACITY, blur: FO_MODAL_OVERLAY_BLUR_PX }}
      >
        <Box pos="relative">
          <Box
            pos="absolute"
            top="var(--fo-space-4)"
            right="var(--fo-space-4)"
            className="fo-z2"
          >
            <ActionIcon variant="subtle" onClick={closeNomineeCard} aria-label="Close">
              <Text component="span" className="mi-icon mi-icon-tiny" aria-hidden="true">
                close
              </Text>
            </ActionIcon>
          </Box>

          {mobileNominee ? (
            <NomineeTooltipCard
              unitKind={mobileNominee.unitKind}
              categoryName={mobileNominee.categoryName}
              filmTitle={mobileNominee.filmTitle}
              filmYear={mobileNominee.filmYear}
              filmPosterUrl={mobileNominee.filmPosterUrl}
              contributors={mobileNominee.contributors}
              performerName={mobileNominee.performerName}
              performerCharacter={mobileNominee.performerCharacter}
              performerProfileUrl={mobileNominee.performerProfileUrl}
              performerProfilePath={mobileNominee.performerProfilePath}
              songTitle={mobileNominee.songTitle}
              action={
                props.canDraftAction ? (
                  <Button
                    fullWidth
                    onClick={() => {
                      const id = mobileNominationId;
                      if (id == null) return;
                      closeNomineeCard();
                      o.myRoster.submitPickNomination(id);
                    }}
                  >
                    Draft
                  </Button>
                ) : null
              }
            />
          ) : (
            <Text className="baseline-textBody">—</Text>
          )}
        </Box>
      </Modal>
    </Box>
  );
}
