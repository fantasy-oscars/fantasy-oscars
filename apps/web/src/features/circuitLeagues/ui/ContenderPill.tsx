import { Box, Text, Tooltip } from "@ui";
import { contenderPillName, type ContenderPillState } from "@/decisions/contenderPill";
import { DraftCategoryIcon } from "@/shared/nominee/DraftCategoryIcon";
import {
  NOMINEE_CARD_TOOLTIP_STYLES,
  NOMINEE_TOOLTIP_EVENTS,
  NOMINEE_TOOLTIP_OFFSET_PX
} from "@/shared/nominee/nomineeTooltip";

/**
 * A season contender as the ceremony's static roster pill: the category icon
 * (always; a category without one shows the fallback glyph), the label and
 * optional points. With a `tooltip` (the nominee card) the pill is a
 * focusable group that shows it on hover and focus. Lists of pills outside
 * the draft room sit inside `.fo-pillScope`, which gives them their ink.
 * With `onOpenCard` (a phone or a coarse pointer) the pill is a button that
 * opens the phone nominee card instead. With `onActivate` (a claim that
 * opens its edit modal) the pill is a button that keeps its tooltip.
 */
export function ContenderPill(props: {
  label: string;
  categoryName: string;
  iconCode: string | null;
  iconVariant: string;
  /** The figure at the end of the pill ("+3"); `points` feeds the accessible name. */
  pointsLabel?: string | null;
  points?: number | null;
  state?: ContenderPillState;
  winner?: boolean;
  /** The state's words for the accessible name: "dropped", "owned by pia". */
  stateSuffix?: string | null;
  /** A log move that starts the accessible name: "Added", "Dropped". */
  movePrefix?: string | null;
  tooltip?: React.ReactNode;
  /** Phone or coarse pointer: a tap (or Enter or Space) opens the nominee card. */
  onOpenCard?: () => void;
  /** A click (or Enter or Space) opens the context's dialog; the tooltip stays. */
  onActivate?: () => void;
  /** Runs before the pill's own keys; a handled key calls `preventDefault`. */
  onKeyDown?: (e: React.KeyboardEvent) => void;
  /** `aria-keyshortcuts` for keys the context adds through `onKeyDown`. */
  keyShortcuts?: string;
  className?: string;
}) {
  const state = props.state ?? "default";
  const open = props.onOpenCard ?? props.onActivate;
  const withPoints = props.pointsLabel !== null && props.pointsLabel !== undefined;
  const pill = (
    <Box
      className={[
        "dr-pill",
        "dr-pill-static",
        "dr-pill-standard",
        state === "default" ? "" : `is-${state}`,
        props.winner && state !== "muted" ? "is-winner" : "",
        open ? "is-cardOpener" : "",
        props.className ?? ""
      ]
        .filter(Boolean)
        .join(" ")}
      role={open ? "button" : "group"}
      tabIndex={props.tooltip || open ? 0 : undefined}
      aria-haspopup={open ? "dialog" : undefined}
      onClick={open}
      aria-keyshortcuts={props.keyShortcuts}
      onKeyDown={
        open || props.onKeyDown
          ? (e: React.KeyboardEvent) => {
              props.onKeyDown?.(e);
              if (e.defaultPrevented || !open) return;
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              open();
            }
          : undefined
      }
      aria-label={contenderPillName({
        categoryName: props.categoryName,
        label: props.label,
        points: withPoints ? (props.points ?? null) : null,
        stateSuffix: props.stateSuffix,
        movePrefix: props.movePrefix
      })}
    >
      {state === "armed" ? (
        <Text
          component="span"
          className="mi-icon mi-icon-tiny dr-pill-armedMark"
          aria-hidden="true"
        >
          check
        </Text>
      ) : null}
      <DraftCategoryIcon
        icon={props.iconCode ?? ""}
        variant={props.iconVariant === "inverted" ? "inverted" : "default"}
        className="dr-pill-icon"
      />
      <Text component="span" className="dr-pill-text" title={props.label}>
        {props.label}
      </Text>
      {withPoints ? (
        <Text component="span" className="dr-pill-points" aria-hidden="true">
          {props.pointsLabel}
        </Text>
      ) : null}
    </Box>
  );
  if (!props.tooltip || props.onOpenCard) return pill;
  return (
    <Tooltip
      events={NOMINEE_TOOLTIP_EVENTS}
      withArrow={false}
      position="bottom-start"
      multiline
      offset={NOMINEE_TOOLTIP_OFFSET_PX}
      styles={NOMINEE_CARD_TOOLTIP_STYLES}
      label={props.tooltip}
    >
      {pill}
    </Tooltip>
  );
}

/** The muted one-line caption beside a pill: "Owned by pia". */
export function ContenderPillCaption(props: { children: string }) {
  return (
    <Text component="span" className="dr-pill-caption" title={props.children}>
      {props.children}
    </Text>
  );
}
