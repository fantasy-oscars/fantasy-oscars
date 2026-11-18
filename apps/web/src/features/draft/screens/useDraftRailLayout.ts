import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DraftRoomOrchestration } from "@/orchestration/draft";
import { pickDraftDivisor } from "@/decisions/draftRoomUnits";
import { useCssVars } from "@/shared/dom/useCssVars";

export type DraftRailId = "ledger" | "roster" | "autodraft";

/**
 * The desktop draft room's rail layout: which of the three rails are open,
 * the unit divisor for the viewport, and the board's column count. The
 * ceremony and season draft rooms share it, so rails open, close, remember
 * and squeeze the same way in both. The returned ref goes on `.dr-layout`.
 */
export function useDraftRailLayout(input: {
  isPre: boolean;
  isLiveOrPaused: boolean;
  /** Remembered open/closed choice per rail (null: no stored choice). */
  railPreferences: DraftRoomOrchestration["preferences"]["value"]["rails"];
  onRailOpenChange: (rail: DraftRailId, open: boolean) => void;
}) {
  const { isPre, isLiveOrPaused, onRailOpenChange } = input;

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

  const [ledgerOpen, setLedgerOpenState] = useState(
    input.railPreferences.ledger ?? !isPre
  );
  const [myRosterOpen, setMyRosterOpenState] = useState(
    input.railPreferences.roster ?? !isPre
  );
  const [autoDraftOpen, setAutoDraftOpenState] = useState(
    input.railPreferences.autodraft ?? true
  );

  // Stopgap: narrow desktop keeps board visible but prevents "all rails open" squeeze.
  // (Mobile uses a separate layout path.)
  const compactRails = viewportWidthPx > 0 && viewportWidthPx < 665;

  // Only deliberate toggles on a regular layout are remembered; the forced states
  // (pre-draft, compact exclusivity) are layout constraints, not preferences.
  const rememberRail = useCallback(
    (rail: DraftRailId, open: boolean) => {
      if (!isPre && !compactRails) onRailOpenChange(rail, open);
    },
    [compactRails, isPre, onRailOpenChange]
  );
  const setLedgerOpen = useCallback(
    (open: boolean) => {
      setLedgerOpenState(open);
      rememberRail("ledger", open);
    },
    [rememberRail]
  );
  const setMyRosterOpen = useCallback(
    (open: boolean) => {
      setMyRosterOpenState(open);
      rememberRail("roster", open);
    },
    [rememberRail]
  );
  const setAutoDraftOpen = useCallback(
    (open: boolean) => {
      setAutoDraftOpenState(open);
      rememberRail("autodraft", open);
    },
    [rememberRail]
  );

  const openRailExclusive = useCallback(
    (rail: "ledger" | "roster" | "auto") => {
      if (!compactRails) return;
      setLedgerOpenState(rail === "ledger");
      setMyRosterOpenState(rail === "roster");
      setAutoDraftOpenState(rail === "auto");
    },
    [compactRails]
  );

  useEffect(() => {
    if (isPre) {
      setLedgerOpenState(false);
      setMyRosterOpenState(false);
      setAutoDraftOpenState(true);
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

  return {
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
  };
}
