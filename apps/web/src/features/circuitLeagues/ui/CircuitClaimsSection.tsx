import { Divider, Group, Stack, Text, Title } from "@ui";
import { FormStatus } from "@/shared/forms";
import { circuitClaimsNote, type CircuitClaimRow } from "@/decisions/circuitWaivers";
import type { ContenderPillView } from "@/decisions/contenderPill";
import type { ApiResult, CircuitClaim, CircuitClaims } from "@/lib/types";
import {
  ContenderPicker,
  type ContenderPickerProps
} from "@/features/contenders/ui/ContenderPicker";
import { CircuitClaimList } from "./CircuitClaimList";

/** The heading the season page's Add/drop deep-links to (`#claim`). */
export const CIRCUIT_CLAIM_HEADING_ID = "circuit-claims-add";

const NOTE_ID = "circuit-claims-note";

/**
 * The viewer's own claims for the open window: what the window is, the
 * ranked claims and the picker that starts a new one. Nobody else sees them.
 */
export function CircuitClaimsSection(props: {
  claims: CircuitClaims;
  /** The pending claims, first choice first, as rows of pills. */
  rows: CircuitClaimRow[];
  phone: boolean;
  canClaim: boolean;
  busy: boolean;
  status: ApiResult | null;
  picker: ContenderPickerProps | null;
  onReorder: (claimIds: number[]) => void;
  onEdit: (claim: CircuitClaim) => void;
  onWithdraw: (claim: CircuitClaim) => void;
  onOpenCard?: (view: ContenderPillView) => void;
}) {
  const { claims, rows } = props;
  return (
    <Stack gap="sm" component="section" aria-labelledby="circuit-claims-title">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Title order={3} variant="section" id="circuit-claims-title">
          Your claims
        </Title>
        {claims.window ? (
          <Text variant="meta">
            {rows.length === 1 ? "1 claim" : `${rows.length} claims`}
          </Text>
        ) : null}
      </Group>
      <Divider />
      <Text id={NOTE_ID} className="baseline-textBody" role="status">
        {circuitClaimsNote(claims)}
      </Text>
      <FormStatus loading={false} result={props.status} />
      {claims.window ? (
        rows.length === 0 ? (
          <Text className="baseline-textBody">
            You have no claims. Pick a contender below to claim it.
          </Text>
        ) : (
          <CircuitClaimList
            rows={rows}
            editable={props.canClaim}
            busy={props.busy}
            phone={props.phone}
            describedBy={NOTE_ID}
            onReorder={props.onReorder}
            onEdit={props.onEdit}
            onWithdraw={props.onWithdraw}
            onOpenCard={props.onOpenCard}
          />
        )
      ) : null}
      {props.canClaim && props.picker ? (
        <Stack gap="xs" component="section" aria-labelledby={CIRCUIT_CLAIM_HEADING_ID}>
          <Title order={4} variant="section" id={CIRCUIT_CLAIM_HEADING_ID} tabIndex={-1}>
            Claim a contender
          </Title>
          <ContenderPicker {...props.picker} />
        </Stack>
      ) : null}
    </Stack>
  );
}
