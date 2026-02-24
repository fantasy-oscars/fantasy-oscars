import { Box, Group, Text, Tooltip } from "@ui";
import type { RefObject } from "react";
import { AvatarToken } from "./AvatarToken";
import { DirectionChevron } from "./DirectionChevron";
import { NOMINEE_TOOLTIP_EVENTS } from "./nomineeTooltip";

export function ParticipantStrip(props: {
  containerRef: RefObject<HTMLDivElement | null>;
  capacity: number;
  start: number;
  end: number;
  participants: Array<{
    seatNumber: number;
    label: string;
    active: boolean;
    avatarKey: string;
  }>;
  activeIndex: number;
  direction: "FORWARD" | "REVERSE" | null;
  suppressActive?: boolean;
  onParticipantHoverSeat?: (seatNumber: number | null) => void;
}) {
  const minTokens = 4;
  const n = props.participants.length;
  const active = props.suppressActive
    ? 0
    : Math.min(Math.max(0, props.activeIndex), Math.max(0, n - 1));

  const windowSize = Math.min(n, Math.max(1, props.capacity));
  const start = Math.max(0, Math.min(props.start, n));
  const end = Math.max(start, Math.min(props.end, n));
  const headHidden = start;
  const tailHidden = n - end;
  const visible = props.participants.slice(start, end);

  if (n === 0) return <Box className="drh-strip" ref={props.containerRef} />;

  // Only use the super-collapsed summary when there are *more* participants than we can
  // reasonably show. If there are fewer than `minTokens` total, show them all.
  if (windowSize < Math.min(minTokens, n) && n > 0) {
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
        <Box
          className="drh-strip"
          ref={props.containerRef}
          onMouseLeave={() => props.onParticipantHoverSeat?.(null)}
        >
          <Box
            className="drh-tokenWrap"
            onMouseEnter={() => props.onParticipantHoverSeat?.(current.seatNumber)}
            onMouseLeave={() => props.onParticipantHoverSeat?.(null)}
          >
            <AvatarToken label={current.label} avatarKey={current.avatarKey} active />
            <DirectionChevron direction={props.direction} />
          </Box>
        </Box>
      </Tooltip>
    );
  }

  return (
    <Group
      className="drh-strip"
      gap="var(--fo-space-8)"
      wrap="nowrap"
      ref={props.containerRef}
      onMouseLeave={() => props.onParticipantHoverSeat?.(null)}
    >
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
          <Box
            className="drh-token drh-overflow"
            tabIndex={0}
            aria-label={`${headHidden} more`}
          >
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
            <Box
              className="drh-tokenWrap"
              tabIndex={0}
              aria-label={p.label}
              onMouseEnter={() => props.onParticipantHoverSeat?.(p.seatNumber)}
              onMouseLeave={() => props.onParticipantHoverSeat?.(null)}
            >
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
          <Box
            className="drh-token drh-overflow"
            tabIndex={0}
            aria-label={`${tailHidden} more`}
          >
            <Text className="drh-overflowText">+{tailHidden}</Text>
          </Box>
        </Tooltip>
      )}
    </Group>
  );
}
