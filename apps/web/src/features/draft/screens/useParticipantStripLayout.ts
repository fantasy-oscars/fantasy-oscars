import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";

export function useParticipantStripLayout(args: {
  containerRef: RefObject<HTMLDivElement | null>;
  participants: Array<{
    seatNumber: number;
    label: string;
    active: boolean;
    avatarKey: string;
  }>;
  activeIndex: number;
  direction: "FORWARD" | "REVERSE" | null;
  suppressActive?: boolean;
}) {
  const minTokens = 4;
  const n = args.participants.length;
  const active = args.suppressActive
    ? 0
    : Math.min(Math.max(0, args.activeIndex), Math.max(0, n - 1));

  const [capacity, setCapacity] = useState(() => Math.max(1, Math.min(n, 8)));
  const windowRef = useRef<{ start: number; end: number }>({
    start: 0,
    end: Math.min(n, capacity)
  });

  useEffect(() => {
    const el = args.containerRef.current;
    if (!el) return;

    const compute = () => {
      // Measure stride from rendered DOM (Mantine Group gap + token wrap width),
      // rather than hard-coding widths, which can desync as styles change.
      const style = window.getComputedStyle(el);
      const gapRaw = style.gap || style.columnGap || "0";
      const gapPx = Number.parseFloat(gapRaw) || 0;
      const tokenEl = el.querySelector<HTMLElement>(".drh-tokenWrap,.drh-token");
      const tokenW = tokenEl ? tokenEl.getBoundingClientRect().width : 33;
      const stride = Math.max(1, tokenW + gapPx);

      const w = el.clientWidth;
      // Small safety margin so we don't visually crowd the buckle at the center.
      const usable = Math.max(0, w - 8);
      // When there are only a few participants, always show them (even if our stride
      // estimate is briefly wrong during layout), to avoid the confusing 1-token collapse.
      const fit = Math.floor(usable / stride);
      const nextCap = n <= minTokens ? n : Math.max(1, Math.min(fit, n));
      setCapacity((prev) => (prev === nextCap ? prev : nextCap));
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [n]);

  const nextIndex = args.suppressActive
    ? active
    : args.direction === "REVERSE"
      ? Math.max(0, active - 1)
      : Math.min(n - 1, active + 1);
  const windowSize = Math.min(n, Math.max(1, capacity));

  let { start, end } = windowRef.current;
  if (end - start !== windowSize) {
    start = 0;
    end = Math.min(n, windowSize);
  }

  const needsSlide =
    !(active >= start && active < end) || !(nextIndex >= start && nextIndex < end);
  if (needsSlide) {
    // Slide just enough to include current + next.
    const minNeeded = Math.min(active, nextIndex);
    const maxNeeded = Math.max(active, nextIndex);
    start = Math.max(0, Math.min(minNeeded, maxNeeded - (windowSize - 1)));
    end = Math.min(n, start + windowSize);
    start = Math.max(0, end - windowSize);
    windowRef.current = { start, end };
  }

  return {
    capacity,
    start,
    end
  };
}
