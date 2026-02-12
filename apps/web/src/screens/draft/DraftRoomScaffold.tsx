import { Box } from "@ui";
import type { RefObject } from "react";
import { createRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DraftRoomOrchestration } from "../../orchestration/draft";
import { computeMasonry, estimateCategoryCardHeightPx } from "../../decisions/draftRoomLayout";
import { pickDraftDivisor } from "../../decisions/draftRoomUnits";
import { DraftAutoDraftRail } from "@/features/draft/ui/DraftAutoDraftRail";
import { DraftLedgerRail } from "@/features/draft/ui/DraftLedgerRail";
import { DraftMasonryBoard } from "@/features/draft/ui/DraftMasonryBoard";
import { DraftMyRosterRail } from "@/features/draft/ui/DraftMyRosterRail";
import { useCssVars } from "@/shared/dom/useCssVars";

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
      songTitle: string | null;
      categoryIcon: string;
      categoryIconVariant: "default" | "inverted";
    }
  >;
  autodraft: DraftRoomOrchestration["autodraft"];
  draftedNominationIds: Set<number>;
  canDraftAction: boolean;
  onNomineeClick: (nominationId: number, label: string) => void;
  onNomineeDoubleClick: (nominationId: number) => void;
}) {
  const isPre = props.draftStatus === "PENDING";
  const isLiveOrPaused =
    props.draftStatus === "IN_PROGRESS" || props.draftStatus === "PAUSED";

  // A11y: tab order defaults to category headers; entering a category makes its pills tabbable.
  const [keyboardCategoryId, setKeyboardCategoryId] = useState<string | null>(null);

  const [viewportWidthPx, setViewportWidthPx] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 0
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    let raf: number | null = null;
    const onResize = () => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        setViewportWidthPx(window.innerWidth);
        raf = null;
      });
    };
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const unitDivisor = useMemo(() => pickDraftDivisor(viewportWidthPx), [viewportWidthPx]);

  const [ledgerOpen, setLedgerOpen] = useState(!isPre);
  const [myRosterOpen, setMyRosterOpen] = useState(!isPre);
  const [autoDraftOpen, setAutoDraftOpen] = useState(true);

  // Stopgap: narrow desktop keeps board visible but prevents "all rails open" squeeze.
  // (Mobile uses a separate layout path.)
  const compactRails = viewportWidthPx > 0 && viewportWidthPx < 665;

  const openRailExclusive = useCallback((rail: "ledger" | "roster" | "auto") => {
    if (!compactRails) return;
    setLedgerOpen(rail === "ledger");
    setMyRosterOpen(rail === "roster");
    setAutoDraftOpen(rail === "auto");
  }, [compactRails]);

  useEffect(() => {
    if (isPre) {
      setLedgerOpen(false);
      setMyRosterOpen(false);
      setAutoDraftOpen(true);
      return;
    }
    if (isLiveOrPaused) {
      // Leave user toggles as-is once the draft is live/paused.
      return;
    }
  }, [isLiveOrPaused, isPre]);

  useEffect(() => {
    if (!compactRails) return;
    // Enforce mutual exclusivity if we enter compact mode with multiple rails open.
    const openCount =
      (ledgerOpen ? 1 : 0) + (myRosterOpen ? 1 : 0) + (autoDraftOpen ? 1 : 0);
    if (openCount <= 1) return;
    // Prefer the most recently-relevant rail: auto-draft pre-draft, otherwise roster.
    if (isPre) openRailExclusive("auto");
    else openRailExclusive(myRosterOpen ? "roster" : ledgerOpen ? "ledger" : "auto");
  }, [autoDraftOpen, compactRails, isPre, ledgerOpen, myRosterOpen, openRailExclusive]);

  const expandedCount =
    (ledgerOpen ? 1 : 0) + (myRosterOpen ? 1 : 0) + (autoDraftOpen ? 1 : 0);
  const midColsMax = Math.max(1, Math.round(unitDivisor - 0.75)); // 0.75 = 3 collapsed rails
  const midCols = Math.max(1, midColsMax - expandedCount);

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

  const layoutRef = useRef<HTMLDivElement | null>(null);
  const layoutVars = useMemo(
    () => ({
      "--d": unitDivisor,
      "--rail-ledger": ledgerOpen ? 1.25 : 0.25,
      "--rail-roster": myRosterOpen ? 1.25 : 0.25,
      "--rail-auto": autoDraftOpen ? 1.25 : 0.25,
      "--mid-cols": midCols
    }),
    [autoDraftOpen, ledgerOpen, midCols, myRosterOpen, unitDivisor]
  );
  useCssVars(layoutRef, layoutVars);

  return (
    <Box
      ref={layoutRef}
      className="dr-layout"
    >
      <DraftLedgerRail
        open={ledgerOpen}
        setOpen={setLedgerOpen}
        isPre={isPre}
        compactRails={compactRails}
        openRailExclusive={openRailExclusive}
        ledgerRows={props.ledgerRows}
        avatarKeyBySeat={props.avatarKeyBySeat}
        nomineeById={props.nomineeById}
      />

      <DraftMasonryBoard
        midCols={midCols}
        masonry={masonry}
        keyboardCategoryId={keyboardCategoryId}
        setKeyboardCategoryId={setKeyboardCategoryId}
        firstPillRefByCategoryId={firstPillRefByCategoryId.current}
        canDraftAction={props.canDraftAction}
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
      />

      <DraftAutoDraftRail
        open={autoDraftOpen}
        setOpen={setAutoDraftOpen}
        compactRails={compactRails}
        openRailExclusive={openRailExclusive}
        autodraft={props.autodraft}
        nomineeById={props.nomineeById}
        draftedNominationIds={props.draftedNominationIds}
      />
    </Box>
  );
}
