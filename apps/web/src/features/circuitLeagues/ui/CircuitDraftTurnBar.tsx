import { Box, Button, Group, Stack, Text } from "@ui";
import { FormStatus } from "@/shared/forms";
import type { ApiResult } from "@/lib/types";

/**
 * The live draft's header: the slot on the clock and who has it, the pick
 * clock, a note in the supplemental round, and Pause or Resume for the
 * commissioner. The clock is plain text; turn changes are announced by the
 * room's live region, not by every tick.
 */
export function CircuitDraftTurnBar(props: {
  /** "On the clock: Round 1, pick 2 · blake", or the completed line. */
  headline: string;
  clockLabel: string | null;
  urgent: boolean;
  /** Tags the bar "Your turn" when the viewer is on the clock. */
  viewerOnTheClock: boolean;
  roundNote: string | null;
  autoDraftNote: string | null;
  paused: boolean;
  canPause: boolean;
  pausing: boolean;
  pauseStatus: ApiResult | null;
  onTogglePause: () => void;
}) {
  return (
    <Stack gap="xs">
      <Box
        className={[
          "circuit-turnBar",
          props.viewerOnTheClock ? "is-viewer" : "",
          props.paused ? "is-paused" : ""
        ]
          .filter(Boolean)
          .join(" ")}
        data-testid="circuit-turn-bar"
      >
        <Stack gap="var(--fo-space-4)" className="circuit-turnMain">
          {props.viewerOnTheClock ? (
            <Text variant="meta" className="circuit-turnTag">
              Your turn
            </Text>
          ) : null}
          <Text
            className="baseline-textBody baseline-wrapAnywhere"
            fw="var(--fo-font-weight-bold)"
          >
            {props.headline}
          </Text>
          {props.roundNote ? <Text variant="helper">{props.roundNote}</Text> : null}
          {props.autoDraftNote ? (
            <Text variant="helper">{props.autoDraftNote}</Text>
          ) : null}
        </Stack>
        <Group gap="sm" wrap="wrap" className="circuit-turnSide">
          {props.clockLabel ? (
            <Text
              component="span"
              className={`circuit-turnClock${props.urgent ? " is-urgent" : ""}`}
              data-testid="circuit-pick-clock"
            >
              {props.clockLabel}
            </Text>
          ) : null}
          {props.canPause ? (
            <Button
              variant="outline"
              onClick={props.onTogglePause}
              loading={props.pausing}
            >
              {props.paused ? "Resume draft" : "Pause draft"}
            </Button>
          ) : null}
        </Group>
      </Box>
      <FormStatus loading={false} result={props.pauseStatus} />
    </Stack>
  );
}
