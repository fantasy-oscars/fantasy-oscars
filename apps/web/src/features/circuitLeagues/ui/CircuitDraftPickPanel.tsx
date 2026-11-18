import type { ReactNode } from "react";
import { Box, Divider, Stack, Text, Title, VisuallyHidden } from "@ui";
import { FormStatus } from "@/shared/forms";
import type { ApiResult } from "@/lib/types";
import {
  ContenderPicker,
  type ContenderPickerProps
} from "@/features/contenders/ui/ContenderPicker";

const REASON_ID = "circuit-pick-reason";

/**
 * The room's middle column: the contender form in place of the ceremony
 * room's nominee board. It builds a contender (category, film, person) and
 * then drafts it, queues it or stages it. Drafting is live only while the
 * viewer's seat is on the clock; the reason says why not (whose pick it is,
 * a pause, a lost connection). Queueing and staging work at any time.
 */
export function CircuitDraftPickPanel(props: {
  /** "Your pick" while the draft runs; "Prepare your picks" in the lobby. */
  title: string;
  /** "Season · League": which draft this is, as the old page subtitle said. */
  context: string;
  reason: string;
  /** The viewer is on the clock: the reason reads as a call to act. */
  ready: boolean;
  notes: string[];
  statuses: Array<ApiResult | null>;
  /** Null for a viewer who has not joined the season. */
  picker: ContenderPickerProps | null;
  /** Shown below the form: the lobby's facts. */
  children?: ReactNode;
}) {
  return (
    <Box
      className={["dr-middle", "circuit-roomMiddle"].join(" ")}
      component="section"
      aria-labelledby="circuit-pick-title"
    >
      <Stack gap="lg" className="circuit-roomPanel">
        <Stack gap="sm">
          <Title order={2} variant="section" id="circuit-pick-title">
            {props.title}
          </Title>
          <Text variant="meta" className="baseline-wrapAnywhere">
            {props.context}
          </Text>
          <Divider />
          <Text
            id={REASON_ID}
            className={["baseline-textBody", props.ready ? "circuit-pickReady" : ""]
              .join(" ")
              .trim()}
            data-testid="circuit-pick-reason"
          >
            {props.reason}
          </Text>
          {props.notes.map((note) => (
            <Text key={note} variant="helper">
              {note}
            </Text>
          ))}
          {props.statuses.map((status, idx) => (
            <FormStatus key={idx} loading={false} result={status} />
          ))}
          {props.picker ? (
            <Box
              component="fieldset"
              className="circuit-pickFieldset"
              aria-describedby={REASON_ID}
            >
              <VisuallyHidden component="legend">Choose a contender</VisuallyHidden>
              <ContenderPicker {...props.picker} />
            </Box>
          ) : null}
        </Stack>
        {props.children}
      </Stack>
    </Box>
  );
}
