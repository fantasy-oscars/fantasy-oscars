import type { ReactNode } from "react";
import { Box, Text, UnstyledButton } from "@ui";
import { useRailFocusReturn } from "./useRailFocusReturn";

/**
 * One collapsible rail of a draft room: open, a titled pane with a collapse
 * chevron and a scrolling body; collapsed, a full-height stub that expands
 * it. The ceremony and season draft rooms both build their rails on this, so
 * the rails look and behave the same in each.
 */
export function DraftRail(props: {
  /** The rail's class suffix: `dr-rail-<kind>`. */
  kind: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  icon: string;
  title: string;
  /** The side of the board the rail sits on; the collapse chevron points that way. */
  side: "left" | "right";
  /** Unavailable (before the draft starts): the stub is dimmed and does nothing. */
  disabled?: boolean;
  disabledTitle?: string;
  compactRails: boolean;
  /** Opens this rail and closes the others (compact layouts). */
  openExclusive: () => void;
  children: ReactNode;
}) {
  const { open, setOpen, title } = props;
  const { toggleRef, closeRef, close, noteExpand } = useRailFocusReturn(open, setOpen);
  const name = title.toLowerCase();

  return (
    <Box
      className={[
        "dr-rail",
        `dr-rail-${props.kind}`,
        open ? "is-open" : "is-collapsed"
      ].join(" ")}
    >
      {open ? (
        <Box className="dr-railPane">
          <Box className="dr-railPaneHeader">
            <Box className="dr-railPaneTitleRow">
              <Text component="span" className="mi-icon mi-icon-tiny" aria-hidden="true">
                {props.icon}
              </Text>
              <Text className="dr-railPaneTitle" title={title}>
                {title}
              </Text>
            </Box>
            <UnstyledButton
              type="button"
              ref={closeRef}
              className="dr-railClose"
              aria-label={`Collapse ${name}`}
              onClick={close}
            >
              <Text component="span" className="mi-icon mi-icon-tiny" aria-hidden="true">
                {props.side === "left" ? "chevron_left" : "chevron_right"}
              </Text>
            </UnstyledButton>
          </Box>
          <Box className="dr-railPaneBody" role="region" aria-label={title} tabIndex={0}>
            {props.children}
          </Box>
        </Box>
      ) : (
        <UnstyledButton
          type="button"
          ref={toggleRef}
          className={["dr-railToggle", props.disabled ? "is-disabled" : ""]
            .filter(Boolean)
            .join(" ")}
          aria-label={`Expand ${name}`}
          aria-disabled={props.disabled}
          title={props.disabled ? (props.disabledTitle ?? title) : title}
          onClick={() => {
            if (props.disabled) return;
            noteExpand();
            if (props.compactRails) props.openExclusive();
            else setOpen(true);
          }}
        >
          <Text component="span" className="mi-icon dr-railStubIcon" aria-hidden="true">
            {props.icon}
          </Text>
        </UnstyledButton>
      )}
    </Box>
  );
}
