import { Alert, Box, Button, Group, Modal, Select, Stack, Text } from "@ui";
import { FormStatus } from "@/shared/forms";
import { AlertIcon } from "@/shared/AlertIcon";
import {
  circuitSelectionLabel,
  type CircuitRosterEntry
} from "@/decisions/circuitRoster";
import { circuitChipLabel } from "@/decisions/circuitWaivers";
import type { ApiResult, CircuitClaims } from "@/lib/types";
import type { CircuitClaimDraft } from "@/orchestration/circuitWaivers";

const CHIP_HELP_ID = "circuit-claim-chip-help";
const DROP_HELP_ID = "circuit-claim-drop-help";

/**
 * A claim's options: the conditional drop and the chip. Opens for a new claim
 * once a contender is picked, and from a claim's Edit action. Centred on
 * desktop, full screen on phone.
 */
export function CircuitClaimModal(props: {
  draft: CircuitClaimDraft | null;
  phone: boolean;
  dropOptions: CircuitRosterEntry[];
  chipOptions: CircuitClaims["chips"];
  warning: string | null;
  saving: boolean;
  status: ApiResult | null;
  onChange: (patch: { dropSelectionId?: number | null; chipId?: number | null }) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const { draft, phone, saving } = props;
  const label = draft ? circuitSelectionLabel(draft.selection) : "";
  const isNew = draft?.claimId === null;
  return (
    <Modal
      opened={draft !== null}
      onClose={props.onClose}
      title={isNew ? `Claim ${label}` : `Your claim for ${label}`}
      size="lg"
      centered
      fullScreen={phone}
      radius={phone ? 0 : undefined}
      transitionProps={phone ? { transition: "fade" } : undefined}
    >
      {draft ? (
        <Stack
          component="form"
          gap="md"
          onSubmit={(e: React.FormEvent) => {
            // The modal is in a portal: keep its submit from reaching a page form.
            e.preventDefault();
            e.stopPropagation();
            props.onSave();
          }}
        >
          <Stack gap="xs">
            <Select
              label="Drop if this claim wins"
              placeholder="Don't drop anyone"
              data={props.dropOptions.map((e) => ({
                value: String(e.selection.id),
                label: circuitSelectionLabel(e.selection)
              }))}
              value={
                draft.dropSelectionId === null ? null : String(draft.dropSelectionId)
              }
              onChange={(v) => props.onChange({ dropSelectionId: v ? Number(v) : null })}
              clearable
              aria-describedby={DROP_HELP_ID}
            />
            <Text id={DROP_HELP_ID} variant="helper">
              The drop happens only if the claim wins, at the same moment.
            </Text>
          </Stack>
          {props.warning ? (
            <Alert
              color="yellow"
              variant="light"
              icon={<AlertIcon variant="warning" />}
              role="status"
            >
              {props.warning}
            </Alert>
          ) : null}
          <Stack gap="xs">
            <Select
              label="Chip"
              placeholder={props.chipOptions.length > 0 ? "No chip" : "You have no chips"}
              data={props.chipOptions.map((c) => ({
                value: String(c.id),
                label: circuitChipLabel(c.original_pick_number)
              }))}
              value={draft.chipId === null ? null : String(draft.chipId)}
              onChange={(v) => props.onChange({ chipId: v ? Number(v) : null })}
              clearable
              disabled={props.chipOptions.length === 0}
              aria-describedby={CHIP_HELP_ID}
            />
            <Text id={CHIP_HELP_ID} variant="helper">
              Chips come from missed draft picks. A chipped claim runs before every claim
              without one, earliest pick first. The chip is used only if the claim wins.
            </Text>
          </Stack>
          {props.status ? (
            <Box role="alert">
              <FormStatus loading={false} result={props.status} />
            </Box>
          ) : null}
          <Group justify="flex-end" gap="sm" wrap="wrap">
            <Button
              type="button"
              variant="ghost"
              onClick={props.onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              {isNew ? "File claim" : "Save"}
            </Button>
          </Group>
        </Stack>
      ) : null}
    </Modal>
  );
}
