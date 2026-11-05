import React from "react";
import { Box, Text } from "@ui";
import { useCssVars } from "@/shared/dom/useCssVars";

export function CenterBuckle(props: {
  roundNumber: number | null;
  pickNumber: number | null;
  centerText: string;
  centerTypeLabel?: string | null;
  centerTextRolling?: boolean;
  centerTextKey?: string;
  /** Decorative glyph before the centre text (countdown timer, paused). */
  centerGlyph?: "timer" | "pause" | null;
  shiftPx?: number;
  zIndex?: number;
  className?: string;
  // Reserved for future measurement logic; keep signature stable.
  measureText: string | null;
  isTimerDraft: boolean;
  maxHandleLengthPx: number;
}) {
  // Keep buckle width stable. For untimed drafts we clamp to a defensible max width
  // (derived from viewport) and rely on text truncation rather than dynamic measuring.
  const centerPx = props.isTimerDraft ? 140 : props.maxHandleLengthPx;
  const elRef = React.useRef<HTMLDivElement | null>(null);

  useCssVars(elRef, {
    "--drh-buckle-max": `${centerPx}px`,
    "--drh-buckle-shift-x": `${props.shiftPx ?? 0}px`,
    "--drh-buckle-z-index": String(props.zIndex ?? 3)
  });

  const centerText = (
    <Text
      key={props.centerTextKey ?? props.centerText}
      className={["drh-buckleCenter", props.centerTextRolling ? "is-rolling" : ""].join(
        " "
      )}
      lineClamp={1}
    >
      {props.centerText}
    </Text>
  );
  const centerLine = props.centerGlyph ? (
    <Box className="drh-buckleCenterRow">
      <Text component="span" className="mi-icon drh-buckleGlyph" aria-hidden="true">
        {props.centerGlyph}
      </Text>
      {centerText}
    </Box>
  ) : (
    centerText
  );

  return (
    <Box
      className={["drh-buckle", props.className ?? ""].join(" ")}
      data-mode={props.isTimerDraft ? "timer" : "non-timer"}
      ref={elRef}
    >
      {props.roundNumber !== null && (
        <Box className="drh-buckleStack">
          <Text className="drh-buckleLabel">Round</Text>
          <Text className="drh-buckleNumber">{props.roundNumber ?? "—"}</Text>
        </Box>
      )}
      {props.centerTypeLabel ? (
        <Box className="drh-buckleCenterStack">
          <Text className="drh-buckleCenterType">{props.centerTypeLabel}</Text>
          <Box className="drh-buckleCenterViewport">{centerLine}</Box>
        </Box>
      ) : (
        <Box className="drh-buckleCenterSlot">
          <Box className="drh-buckleCenterViewport">{centerLine}</Box>
        </Box>
      )}
      {props.pickNumber !== null && (
        <Box className="drh-buckleStack">
          <Text className="drh-buckleLabel">Pick</Text>
          <Text className="drh-buckleNumber">{props.pickNumber ?? "—"}</Text>
        </Box>
      )}
    </Box>
  );
}
