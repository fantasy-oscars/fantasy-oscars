import { useEffect, useRef, useState, type RefObject } from "react";
import { shouldCompactHeader } from "@/decisions/draft/headerLayout";

/** Width of the tab column: the middle track of the header grid, as resolved by layout. */
function readTabWidth(headerEl: HTMLElement): number {
  const tracks = getComputedStyle(headerEl).gridTemplateColumns.split(" ");
  const middle = Number.parseFloat(tracks[1] ?? "");
  return Number.isFinite(middle) ? middle : 0;
}

/**
 * Whether the header wings must collapse into menus. One observer watches the header and
 * both hidden measure wings, which always hold the full-size content. A theme swap, a
 * font swap or a roster change moves a measure wing, so every cause lands in the same
 * callback and nothing needs a dependency list or a font-loading listener.
 */
export function useHeaderCompaction(args: {
  headerRef: RefObject<HTMLElement | null>;
  leftMeasureRef: RefObject<HTMLElement | null>;
  rightMeasureRef: RefObject<HTMLElement | null>;
}): boolean {
  const { headerRef, leftMeasureRef, rightMeasureRef } = args;
  const [compact, setCompact] = useState(false);
  const compactRef = useRef(false);

  useEffect(() => {
    const headerEl = headerRef.current;
    const leftEl = leftMeasureRef.current;
    const rightEl = rightMeasureRef.current;
    if (!headerEl || !leftEl || !rightEl) return;

    let frame = 0;
    const compute = () => {
      const next = shouldCompactHeader({
        headerWidth: headerEl.getBoundingClientRect().width,
        tabWidth: readTabWidth(headerEl),
        leftNeeded: leftEl.getBoundingClientRect().width,
        rightNeeded: rightEl.getBoundingClientRect().width,
        wasCompact: compactRef.current
      });
      if (next === compactRef.current) return;
      compactRef.current = next;
      setCompact(next);
    };

    compute();
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(compute);
    });
    observer.observe(headerEl);
    observer.observe(leftEl);
    observer.observe(rightEl);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [headerRef, leftMeasureRef, rightMeasureRef]);

  return compact;
}
