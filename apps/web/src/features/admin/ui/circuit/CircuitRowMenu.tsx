import { ActionIcon, Menu, Text } from "@ui";

export type CircuitRowMenuEntry =
  | { kind: "item"; label: string; icon: string; onClick: () => void; disabled?: boolean }
  | { kind: "label"; label: string }
  | { kind: "divider" };

/**
 * A row's overflow menu. It carries the keyboard and touch equivalent of each
 * drag: move up and down, into a group and out of one.
 */
export function CircuitRowMenu(props: {
  label: string;
  disabled: boolean;
  entries: CircuitRowMenuEntry[];
}) {
  return (
    <Menu withinPortal position="bottom-end" shadow="md">
      <Menu.Target>
        <ActionIcon
          type="button"
          variant="subtle"
          aria-label={props.label}
          title={props.label}
          disabled={props.disabled}
        >
          <Text component="span" className="gicon" aria-hidden="true">
            more_vert
          </Text>
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {props.entries.map((entry, idx) =>
          entry.kind === "divider" ? (
            <Menu.Divider key={`divider-${idx}`} />
          ) : entry.kind === "label" ? (
            <Menu.Label key={`label-${idx}`}>{entry.label}</Menu.Label>
          ) : (
            <Menu.Item
              key={entry.label}
              disabled={entry.disabled}
              onClick={entry.onClick}
              leftSection={
                <Text component="span" className="gicon" aria-hidden="true">
                  {entry.icon}
                </Text>
              }
            >
              {entry.label}
            </Menu.Item>
          )
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
