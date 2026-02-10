import { Box, Group, Text, Tooltip } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { AvatarToken } from "./AvatarToken";
import { DirectionChevron } from "./DirectionChevron";
import { NOMINEE_TOOLTIP_EVENTS } from "./nomineeTooltip";

export function ParticipantStrip(props: {
  participants: Array<{
    seatNumber: number;
    label: string;
    active: boolean;
    avatarKey: string | null;
  }>;
  activeIndex: number;
  direction: "FORWARD" | "REVERSE" | null;
  suppressActive?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const minTokens = 4;
  const n = props.participants.length;
  const active = props.suppressActive
    ? 0
    : Math.min(Math.max(0, props.activeIndex), Math.max(0, n - 1));

  const [capacity, setCapacity] = useState(() => Math.max(1, Math.min(n, 8)));
  const windowRef = useRef<{ start: number; end: number }>({
    start: 0,
    end: Math.min(n, capacity)
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const compute = () => {
      // Measure actual stride from rendered DOM (Mantine Group gap + token wrap width),
      // rather than hard-coding widths, which can desync as styles change.
      const style = window.getComputedStyle(el);
      const gapRaw =
        // `gap` is standard; `columnGap` is a fallback for older engines.
        style.gap || style.columnGap || "0";
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

  const nextIndex = props.suppressActive
    ? active
    : props.direction === "REVERSE"
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

  const headHidden = start;
  const tailHidden = n - end;

  const visible = props.participants.slice(start, end);

  if (n === 0) return <Box className="drh-strip" ref={ref} />;

  // Only use the super-collapsed summary when there are *more* participants than we can
  // reasonably show. If there are fewer than `minTokens` total, show them all.
  if (windowSize < Math.min(minTokens, n) && n > 0) {
    const debugEnabled =
      typeof window !== "undefined" &&
      Boolean((window as unknown as { __FO_DEBUG_STRIP__?: boolean }).__FO_DEBUG_STRIP__);
    if (debugEnabled) {
      // eslint-disable-next-line no-console
      console.log("[ParticipantStrip] super-collapsed", {
        windowSize,
        minTokens,
        n,
        capacity,
        start,
        end
      });
    }
    const current = props.participants[active];
    return (
      <Tooltip
        events={NOMINEE_TOOLTIP_EVENTS}
        label={
          <Box className="drh-stripTip">
            {props.participants.map((p) => (
              <Box key={`all-${p.seatNumber}`} className="drh-tipRow">
                <AvatarToken label={p.label} avatarKey={p.avatarKey} active={p.active} />
                <Text className="drh-tipText">{p.label}</Text>
              </Box>
            ))}
          </Box>
        }
      >
        <Box className="drh-strip" ref={ref}>
          <Box className="drh-tokenWrap">
            <AvatarToken label={current.label} avatarKey={current.avatarKey} active />
            <DirectionChevron direction={props.direction} />
          </Box>
        </Box>
      </Tooltip>
    );
  }

  return (
    <Group className="drh-strip" gap={8} wrap="nowrap" ref={ref}>
      {headHidden > 0 && (
        <Tooltip
          events={NOMINEE_TOOLTIP_EVENTS}
          label={
            <Box className="drh-stripTip">
              {props.participants.slice(0, start).map((p) => (
                <Box key={`h-${p.seatNumber}`} className="drh-tipRow">
                  <AvatarToken label={p.label} avatarKey={p.avatarKey} active={false} />
                  <Text className="drh-tipText">{p.label}</Text>
                </Box>
              ))}
            </Box>
          }
        >
          <Box className="drh-token drh-overflow" tabIndex={0} aria-label={`${headHidden} more`}>
            <Text className="drh-overflowText">+{headHidden}</Text>
          </Box>
        </Tooltip>
      )}

      {visible.map((p, idx) => {
        const isActive = !props.suppressActive && start + idx === active;
        return (
          <Tooltip
            key={p.seatNumber}
            events={NOMINEE_TOOLTIP_EVENTS}
            label={p.label}
            withArrow
          >
            <Box className="drh-tokenWrap" tabIndex={0} aria-label={p.label}>
              <AvatarToken label={p.label} avatarKey={p.avatarKey} active={isActive} />
              {isActive && <DirectionChevron direction={props.direction} />}
            </Box>
          </Tooltip>
        );
      })}

      {tailHidden > 0 && (
        <Tooltip
          events={NOMINEE_TOOLTIP_EVENTS}
          label={
            <Box className="drh-stripTip">
              {props.participants.slice(end).map((p) => (
                <Box key={`t-${p.seatNumber}`} className="drh-tipRow">
                  <AvatarToken label={p.label} avatarKey={p.avatarKey} active={false} />
                  <Text className="drh-tipText">{p.label}</Text>
                </Box>
              ))}
            </Box>
          }
        >
          <Box className="drh-token drh-overflow" tabIndex={0} aria-label={`${tailHidden} more`}>
            <Text className="drh-overflowText">+{tailHidden}</Text>
          </Box>
        </Tooltip>
      )}
    </Group>
  );
}

