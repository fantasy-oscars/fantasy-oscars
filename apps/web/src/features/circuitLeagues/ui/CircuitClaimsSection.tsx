import { Divider, Group, Stack, Text, Title } from "@ui";
import { FormStatus } from "@/shared/forms";
import { circuitClaimsNote } from "@/decisions/circuitWaivers";
import type { ApiResult, CircuitClaim, CircuitClaims } from "@/lib/types";
import {
  ContenderPicker,
  type ContenderPickerProps
} from "@/features/contenders/ui/ContenderPicker";
import { CircuitClaimList } from "./CircuitClaimList";

const NOTE_ID = "circuit-claims-note";

/**
 * The viewer's own claims for the open window: what the window is, the
 * ranked claims and the picker that starts a new one. Nobody else sees them.
 */
export function CircuitClaimsSection(props: {
  claims: CircuitClaims;
  categoryNames: ReadonlyMap<number, string>;
  pending: CircuitClaim[];
  canClaim: boolean;
  busy: boolean;
  status: ApiResult | null;
  picker: ContenderPickerProps | null;
  onReorder: (claimIds: number[]) => void;
  onEdit: (claim: CircuitClaim) => void;
  onWithdraw: (claim: CircuitClaim) => void;
}) {
  const { claims, pending } = props;
  return (
    <Stack gap="sm" component="section" aria-labelledby="circuit-claims-title">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Title order={3} variant="section" id="circuit-claims-title">
          Your claims
        </Title>
        {claims.window ? (
          <Text variant="meta">
            {pending.length === 1 ? "1 claim" : `${pending.length} claims`}
          </Text>
        ) : null}
      </Group>
      <Divider />
      <Text id={NOTE_ID} className="baseline-textBody" role="status">
        {circuitClaimsNote(claims)}
      </Text>
      <FormStatus loading={false} result={props.status} />
      {claims.window ? (
        pending.length === 0 ? (
          <Text className="baseline-textBody">
            You have no claims. Pick a contender below to claim it.
          </Text>
        ) : (
          <CircuitClaimList
            claims={pending}
            categoryNames={props.categoryNames}
            editable={props.canClaim}
            busy={props.busy}
            describedBy={NOTE_ID}
            onReorder={props.onReorder}
            onEdit={props.onEdit}
            onWithdraw={props.onWithdraw}
          />
        )
      ) : null}
      {props.canClaim && props.picker ? (
        <Stack gap="xs" component="section" aria-labelledby="circuit-claims-add">
          <Title order={4} variant="section" id="circuit-claims-add">
            Claim a contender
          </Title>
          <ContenderPicker {...props.picker} />
        </Stack>
      ) : null}
    </Stack>
  );
}
