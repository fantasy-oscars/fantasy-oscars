import { Box } from "@ui";
import type { RefObject } from "react";
import { createRef, useRef, useState } from "react";
import type { DraftRoomOrchestration } from "@/orchestration/draft";
import {
  computeMasonry,
  estimateCategoryCardHeightPx
} from "@/decisions/draftRoomLayout";
import { DraftAutoDraftRail } from "@/features/draft/ui/DraftAutoDraftRail";
import { DraftLedgerRail } from "@/features/draft/ui/DraftLedgerRail";
import { DraftMasonryBoard } from "@/features/draft/ui/DraftMasonryBoard";
import { DraftMyRosterRail } from "@/features/draft/ui/DraftMyRosterRail";
import { useDraftRailLayout } from "./useDraftRailLayout";

export function DraftRoomScaffold(props: {
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
      selected: boolean;
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
      performerContributors?: Array<{
        fullName: string;
        roleLabel: string | null;
        profileUrl: string | null;
        profilePath: string | null;
        sortOrder: number;
      }>;
      draftedByLabel?: string | null;
      draftedByAvatarKey?: string | null;
      draftedRoundPick?: string | null;
    }>;
  }>;
  draftStatus: string | null;
  hideEmptyCategories: boolean;
  ledgerRows: DraftRoomOrchestration["ledger"]["rows"];
  myPicks: DraftRoomOrchestration["myRoster"]["picks"];
  avatarKeyBySeat: Map<number, string | null>;
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
      performerContributors?: Array<{
        fullName: string;
        roleLabel: string | null;
        profileUrl: string | null;
        profilePath: string | null;
        sortOrder: number;
      }>;
      songTitle: string | null;
      categoryIcon: string;
      categoryIconVariant: "default" | "inverted";
      draftedByLabel?: string | null;
      draftedByAvatarKey?: string | null;
      draftedRoundPick?: string | null;
    }
  >;
  autodraft: DraftRoomOrchestration["autodraft"];
  draftedNominationIds: Set<number>;
  hoveredNominationIds: Set<number>;
  canDraftAction: boolean;
  onNomineeClick: (nominationId: number, label: string) => void;
  onNomineeDoubleClick: (nominationId: number) => void;
  /** Remembered open/closed choice per rail (null: no stored choice). */
  railPreferences: DraftRoomOrchestration["preferences"]["value"]["rails"];
  onRailOpenChange: (rail: "ledger" | "roster" | "autodraft", open: boolean) => void;
}) {
  const { onRailOpenChange } = props;
  const isPre = props.draftStatus === "PENDING";
  const isLiveOrPaused =
    props.draftStatus === "IN_PROGRESS" || props.draftStatus === "PAUSED";

  // A11y: tab order defaults to category headers; entering a category makes its pills tabbable.
  const [keyboardCategoryId, setKeyboardCategoryId] = useState<string | null>(null);

  const {
    layoutRef,
    midCols,
    compactRails,
    openRailExclusive,
    ledgerOpen,
    setLedgerOpen,
    myRosterOpen,
    setMyRosterOpen,
    autoDraftOpen,
    setAutoDraftOpen
  } = useDraftRailLayout({
    isPre,
    isLiveOrPaused,
    railPreferences: props.railPreferences,
    onRailOpenChange
  });

  const categoriesForBoxes = props.hideEmptyCategories
    ? props.categories.filter((c) => c.nominees.length > 0)
    : props.categories;

  const boxes = categoriesForBoxes.map((c) => ({
    id: c.id,
    title: c.title,
    icon: c.icon,
    iconVariant: c.iconVariant,
    unitKind: c.unitKind,
    weightText: c.weightText,
    nominees: c.nominees,
    // Use a deterministic estimate for masonry placement; the actual card height
    // is content-driven and hugs the pills.
    estimatePx: estimateCategoryCardHeightPx(c.nominees.length)
  }));
  const masonry = computeMasonry(midCols, boxes);

  // A11y: "entering" a category focuses its first nomination pill. Refs are owned by glue.
  const firstPillRefByCategoryId = useRef<
    Record<string, RefObject<HTMLButtonElement | null> | undefined>
  >({});
  for (const c of categoriesForBoxes) {
    if (!firstPillRefByCategoryId.current[c.id]) {
      firstPillRefByCategoryId.current[c.id] = createRef<HTMLButtonElement>();
    }
  }

  return (
    <Box ref={layoutRef} className="dr-layout">
      <DraftLedgerRail
        open={ledgerOpen}
        setOpen={setLedgerOpen}
        isPre={isPre}
        compactRails={compactRails}
        openRailExclusive={openRailExclusive}
        ledgerRows={props.ledgerRows}
        avatarKeyBySeat={props.avatarKeyBySeat}
        nomineeById={props.nomineeById}
        hoveredNominationIds={props.hoveredNominationIds}
      />

      <DraftMasonryBoard
        midCols={midCols}
        masonry={masonry}
        keyboardCategoryId={keyboardCategoryId}
        setKeyboardCategoryId={setKeyboardCategoryId}
        firstPillRefByCategoryId={firstPillRefByCategoryId.current}
        canDraftAction={props.canDraftAction}
        hoveredNominationIds={props.hoveredNominationIds}
        onNomineeClick={props.onNomineeClick}
        onNomineeDoubleClick={props.onNomineeDoubleClick}
      />

      <DraftMyRosterRail
        open={myRosterOpen}
        setOpen={setMyRosterOpen}
        isPre={isPre}
        compactRails={compactRails}
        openRailExclusive={openRailExclusive}
        myPicks={props.myPicks}
        nomineeById={props.nomineeById}
        hoveredNominationIds={props.hoveredNominationIds}
      />

      <DraftAutoDraftRail
        open={autoDraftOpen}
        setOpen={setAutoDraftOpen}
        compactRails={compactRails}
        openRailExclusive={openRailExclusive}
        autodraft={props.autodraft}
        nomineeById={props.nomineeById}
        draftedNominationIds={props.draftedNominationIds}
        hoveredNominationIds={props.hoveredNominationIds}
      />
    </Box>
  );
}
