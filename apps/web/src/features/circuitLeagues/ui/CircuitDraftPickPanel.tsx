import { Box, Divider, Stack, Text, Title, VisuallyHidden } from "@ui";
import { FormStatus } from "@/shared/forms";
import type { ApiResult } from "@/lib/types";
import {
  ContenderPicker,
  type ContenderPickerProps
} from "@/features/contenders/ui/ContenderPicker";

const REASON_ID = "circuit-pick-reason";

/**
 * The viewer's pick: the contender picker, live only while their seat is on
 * the clock. Otherwise it stays on screen, disabled, with the reason (whose
 * pick it is, a pause, a lost connection). A disabled fieldset disables every
 * control inside it, so nothing can be submitted out of turn.
 */
export function CircuitDraftPickPanel(props: {
  canPick: boolean;
  reason: string;
  status: ApiResult | null;
  picker: ContenderPickerProps | null;
}) {
  return (
    <Stack gap="sm" component="section" aria-labelledby="circuit-pick-title">
      <Title order={3} variant="section" id="circuit-pick-title">
        Your pick
      </Title>
      <Divider />
      <Text
        id={REASON_ID}
        className={["baseline-textBody", props.canPick ? "circuit-pickReady" : ""]
          .join(" ")
          .trim()}
        data-testid="circuit-pick-reason"
      >
        {props.reason}
      </Text>
      <FormStatus loading={false} result={props.status} />
      {props.picker ? (
        <Box
          component="fieldset"
          className="circuit-pickFieldset"
          disabled={!props.canPick}
          aria-describedby={REASON_ID}
        >
          <VisuallyHidden component="legend">Draft a contender</VisuallyHidden>
          <ContenderPicker {...props.picker} confirmVerb="Draft" />
        </Box>
      ) : null}
    </Stack>
  );
}
