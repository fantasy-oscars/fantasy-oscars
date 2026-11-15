import { useCallback, useRef, useState, type RefObject } from "react";
import {
  clampWindowStart,
  rosterAnnouncement,
  rosterGeometry,
  stepWindow,
  windowForSeat,
  type RosterGeometry,
  type RosterLayout
} from "../../decisions/draft/rosterWindow";
import { useElementWidth } from "../../shared/dom/useElementWidth";
import { usePrefersReducedMotion } from "../../shared/dom/usePrefersReducedMotion";

export type RosterRotation = {
  layout: RosterLayout;
  count: number;
  /** Attach to the board element that clips the track. */
  boardRef: RefObject<HTMLDivElement | null>;
  geometry: RosterGeometry;
  start: number;
  canPrev: boolean;
  canNext: boolean;
  /** True under reduced motion: the track jumps with no slide. */
  instant: boolean;
  announcement: string;
  step: (dir: -1 | 1) => void;
  toSeat: (index: number) => void;
  toFirst: () => void;
  toLast: () => void;
};

/** Window position, measured geometry and step actions for the roster board. */
export function useRosterRotation(args: {
  count: number;
  layout: RosterLayout;
}): RosterRotation {
  const { count, layout } = args;
  const boardRef = useRef<HTMLDivElement | null>(null);
  const boardWidth = useElementWidth(boardRef);
  const instant = usePrefersReducedMotion();
  const geometry = rosterGeometry(boardWidth, layout);
  const { capacity } = geometry;
  const [rawStart, setRawStart] = useState(0);
  const start = clampWindowStart(rawStart, capacity, count);

  const step = useCallback(
    (dir: -1 | 1) => setRawStart(stepWindow(start, dir, capacity, count)),
    [start, capacity, count]
  );
  const toSeat = useCallback(
    (index: number) => setRawStart(windowForSeat(index, capacity, count)),
    [capacity, count]
  );
  const toFirst = useCallback(() => setRawStart(0), []);
  const toLast = useCallback(
    () => setRawStart(windowForSeat(count - 1, capacity, count)),
    [capacity, count]
  );

  return {
    layout,
    count,
    boardRef,
    geometry,
    start,
    canPrev: start > 0,
    canNext: start + capacity < count,
    instant,
    announcement: rosterAnnouncement(start, capacity, count, layout),
    step,
    toSeat,
    toFirst,
    toLast
  };
}
