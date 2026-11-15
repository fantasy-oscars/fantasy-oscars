import {
  useLayoutEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode
} from "react";
import { ActionIcon, Box, Text, VisuallyHidden } from "@ui";
import { ROSTER_DRAG_STEP_PX } from "@/decisions/draft/rosterWindow";
import type { RosterRotation } from "@/orchestration/draft/useRosterRotation";
import { useCssVars } from "@/shared/dom/useCssVars";

/** Columns rendered beyond the window on each side: the peek and one to slide in. */
const RENDER_MARGIN = 2;

const DRAG_IGNORED = "button, a, input, select, textarea, [role='button']";
const KEYS_IGNORED = "input, textarea, select, [role='listbox'], [aria-expanded='true']";

/**
 * The roster board's sliding window (prescription 06, 5.4). Render only: the position,
 * geometry and steps come from `useRosterRotation`; this wires them to controls, keys and
 * drag, and renders the window plus the columns around it.
 */
export function RosterTrack(props: {
  rotation: RosterRotation;
  renderColumn: (index: number) => ReactNode;
  columnKey: (index: number) => string | number;
  /** Phone: the seat select, between the step buttons. */
  controlsMiddle?: ReactNode;
}) {
  const { rotation, renderColumn, columnKey, controlsMiddle } = props;
  const { geometry, start, count, boardRef } = rotation;
  const { capacity } = geometry;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const hadFocus = useRef(false);
  const drag = useRef<{ id: number; x: number } | null>(null);

  const fits = count <= capacity;
  const from = Math.max(0, start - RENDER_MARGIN);
  const to = Math.min(count, start + capacity + RENDER_MARGIN);

  const vars = useMemo(
    () => ({
      "--roster-side": `${geometry.side}px`,
      "--roster-gap": `${geometry.gap}px`,
      "--roster-col-w": `${geometry.columnWidth}px`,
      "--roster-step": `${geometry.step}px`,
      "--roster-start": start,
      "--roster-from": from
    }),
    [geometry, start, from]
  );
  useCssVars(rootRef, vars);

  // Remember whether focus was in the board before a step, so it can be rescued when the
  // step unmounts or inerts the focused element.
  // An action that cannot move the window leaves nothing to rescue, so the flag is only
  // set when `start` is about to change.
  const run = (action: () => void, moves: boolean) => {
    const board = boardRef.current;
    hadFocus.current = moves && Boolean(board && board.contains(document.activeElement));
    action();
  };

  useLayoutEffect(() => {
    if (!hadFocus.current) return;
    hadFocus.current = false;
    const board = boardRef.current;
    const active = document.activeElement;
    if (
      board &&
      (!active || !board.contains(active) || active.closest("[inert]") !== null)
    ) {
      board.focus();
    }
  }, [start, boardRef]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.target as HTMLElement).closest(KEYS_IGNORED)) return;
    switch (e.key) {
      case "ArrowLeft":
        run(() => rotation.step(-1), rotation.canPrev);
        break;
      case "ArrowRight":
        run(() => rotation.step(1), rotation.canNext);
        break;
      case "Home":
        run(rotation.toFirst, rotation.canPrev);
        break;
      case "End":
        run(rotation.toLast, rotation.canNext);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (fits || (e.pointerType === "mouse" && e.button !== 0)) return;
    if ((e.target as HTMLElement).closest(DRAG_IGNORED)) return;
    // A selection still showing here is the previous gesture's: the browser clears it on
    // this press, and the release check below sees whether this gesture selected text.
    drag.current = { id: e.pointerId, x: e.clientX };
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    if (window.getSelection()?.isCollapsed === false) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > ROSTER_DRAG_STEP_PX) {
      run(
        () => rotation.step(dx < 0 ? 1 : -1),
        dx < 0 ? rotation.canNext : rotation.canPrev
      );
    }
  };

  const columns: ReactNode[] = [];
  for (let i = from; i < to; i++) {
    const inWindow = i >= start && i < start + capacity;
    const side = i < start ? "left" : "right";
    const isPeek = !inWindow && (i === start - 1 || i === start + capacity);
    columns.push(
      <Box
        key={columnKey(i)}
        className="dr-rosterCol"
        data-state={inWindow ? "window" : isPeek ? "peek" : "off"}
        aria-hidden={inWindow ? undefined : true}
        onClick={
          isPeek
            ? () => run(() => rotation.step(side === "left" ? -1 : 1), true)
            : undefined
        }
      >
        <Box className="dr-rosterColInner" inert={!inWindow}>
          {renderColumn(i)}
        </Box>
      </Box>
    );
  }

  return (
    <Box className="dr-rosterRoot" data-layout={rotation.layout} ref={rootRef}>
      {fits ? null : (
        <Box className="dr-rosterControls">
          <StepButton
            label="Previous seat"
            icon="chevron_left"
            disabled={!rotation.canPrev}
            onStep={() => run(() => rotation.step(-1), true)}
          />
          {controlsMiddle}
          <StepButton
            label="Next seat"
            icon="chevron_right"
            disabled={!rotation.canNext}
            onStep={() => run(() => rotation.step(1), true)}
          />
        </Box>
      )}
      <Box
        className="dr-rosterBoard"
        role="region"
        aria-label="Roster board"
        tabIndex={0}
        ref={boardRef}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <Box
          className="dr-rosterTrack"
          data-roster-track=""
          data-fits={fits ? "" : undefined}
          data-instant={rotation.instant ? "" : undefined}
        >
          {columns}
        </Box>
      </Box>
      <VisuallyHidden aria-live="polite">{rotation.announcement}</VisuallyHidden>
    </Box>
  );
}

function StepButton(props: {
  label: string;
  icon: string;
  disabled: boolean;
  onStep: () => void;
}) {
  return (
    <ActionIcon
      variant="secondary"
      className="dr-rosterBtn"
      aria-label={props.label}
      aria-disabled={props.disabled ? true : undefined}
      onClick={() => {
        if (!props.disabled) props.onStep();
      }}
    >
      <Text component="span" className="mi-icon mi-icon-tiny" aria-hidden="true">
        {props.icon}
      </Text>
    </ActionIcon>
  );
}
