import { Button, Divider, Group, Select, Stack, Text, Title } from "@ui";
import { FormStatus } from "@/shared/forms";
import {
  ContenderPicker,
  type ContenderPickerProps
} from "@/features/contenders/ui/ContenderPicker";
import {
  circuitSelectionLabel,
  type CircuitRosterEntry
} from "@/decisions/circuitRoster";
import type { ApiResult, CircuitSelectionSummary } from "@/lib/types";

const DROP_NOTE_ID = "circuit-free-agent-drop-note";

/**
 * Free agency on the viewer's own roster: an optional pick to drop, then the
 * contender picker. Closed while a waiver window is open.
 */
export function CircuitFreeAgentPanel(props: {
  closedNote: string | null;
  picker: ContenderPickerProps;
  dropOptions: CircuitRosterEntry[];
  dropSelectionId: number | null;
  pending: CircuitSelectionSummary | null;
  adding: boolean;
  status: ApiResult | null;
  onChooseDrop: (selectionId: number | null) => void;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const { closedNote, dropOptions, pending, adding, status } = props;
  return (
    <Stack gap="sm" component="section" aria-labelledby="circuit-free-agency">
      <Title order={3} variant="section" id="circuit-free-agency">
        Add a free agent
      </Title>
      <Divider />
      {closedNote ? (
        <Text className="baseline-textBody" role="status">
          {closedNote}
        </Text>
      ) : (
        <>
          {dropOptions.length > 0 ? (
            <Select
              label="Drop to make room"
              placeholder="Don't drop anyone"
              data={dropOptions.map((e) => ({
                value: String(e.selection.id),
                label: circuitSelectionLabel(e.selection)
              }))}
              value={
                props.dropSelectionId === null ? null : String(props.dropSelectionId)
              }
              onChange={(v) => props.onChooseDrop(v ? Number(v) : null)}
              clearable
              aria-describedby={DROP_NOTE_ID}
            />
          ) : null}
          <Text id={DROP_NOTE_ID} variant="helper">
            The add and the drop happen together. A dropped pick is a free agent at once.
          </Text>
          {/* A pick waiting for a drop keeps its retry until it is added or cancelled. */}
          {pending ? (
            <Stack gap="xs">
              <FormStatus loading={false} result={status} />
              <Group gap="sm" wrap="wrap">
                <Button onClick={props.onRetry} loading={adding}>
                  Add {circuitSelectionLabel(pending)}
                </Button>
                <Button variant="default" onClick={props.onCancel} disabled={adding}>
                  Cancel
                </Button>
              </Group>
            </Stack>
          ) : (
            <FormStatus loading={adding} result={status} />
          )}
          <ContenderPicker {...props.picker} />
        </>
      )}
    </Stack>
  );
}
