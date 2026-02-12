import React from "react";
import { Box, Text } from "@ui";
import { useCssVars } from "@/shared/dom/useCssVars";

export function CenterBuckle(props: {
  roundNumber: number | null;
  pickNumber: number | null;
  centerText: string;
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
    "--drh-buckle-max": `${centerPx}px`
  });

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
      <Text className="drh-buckleCenter" lineClamp={1}>
        {props.centerText}
      </Text>
      {props.pickNumber !== null && (
        <Box className="drh-buckleStack">
          <Text className="drh-buckleLabel">Pick</Text>
          <Text className="drh-buckleNumber">{props.pickNumber ?? "—"}</Text>
        </Box>
      )}
    </Box>
  );
}
