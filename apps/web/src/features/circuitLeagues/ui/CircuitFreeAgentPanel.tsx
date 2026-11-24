import { Button, Divider, Group, Select, Stack, Text, Title } from "@ui";
import { FormStatus } from "@/shared/forms";
import {
  ContenderPicker,
  type ContenderPickerProps
} from "@/features/contenders/ui/ContenderPicker";
import {
  CIRCUIT_NO_DROP_LABEL,
  circuitSelectionLabel,
  type CircuitRosterEntry
} from "@/decisions/circuitRoster";
import type { ApiResult, CircuitSelectionSummary } from "@/lib/types";

const DROP_NOTE_ID = "circuit-free-agent-drop-note";
const NO_DROP = "none";
/** The section heading the season page's Add/drop deep-links to (`#add`). */
export const CIRCUIT_FREE_AGENCY_HEADING_ID = "circuit-free-agency";

/**
 * Free agency on the viewer's own roster: an optional pick to drop, then the
 * contender picker. Closed while a waiver window is open.
 */
export function CircuitFreeAgentPanel(props: {
  closedNote: string | null;
  picker: ContenderPickerProps;
  dropOptions: CircuitRosterEntry[];
  dropSelectionId: number | null;
  /** "Select a pick to drop" when the roster or category is full. */
  dropPlaceholder: string;
  pending: CircuitSelectionSummary | null;
  adding: boolean;
  status: ApiResult | null;
  onChooseDrop: (selectionId: number | null) => void;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const { closedNote, dropOptions, pending, adding, status } = props;
  return (
    <Stack gap="sm" component="section" aria-labelledby={CIRCUIT_FREE_AGENCY_HEADING_ID}>
      <Title
        order={3}
        variant="section"
        id={CIRCUIT_FREE_AGENCY_HEADING_ID}
        tabIndex={-1}
      >
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
              placeholder={props.dropPlaceholder}
              data={[
                { value: NO_DROP, label: CIRCUIT_NO_DROP_LABEL },
                ...dropOptions.map((e) => ({
                  value: String(e.selection.id),
                  label: circuitSelectionLabel(e.selection)
                }))
              ]}
              value={
                props.dropSelectionId === null ? null : String(props.dropSelectionId)
              }
              onChange={(v) => props.onChooseDrop(v && v !== NO_DROP ? Number(v) : null)}
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
