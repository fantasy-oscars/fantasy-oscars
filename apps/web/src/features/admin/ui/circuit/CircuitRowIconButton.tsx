import { ActionIcon, Text } from "@ui";

/** A quiet icon button for one row action; the label is its accessible name and tooltip. */
export function CircuitRowIconButton(props: {
  icon: string;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <ActionIcon
      type="button"
      variant="subtle"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <Text component="span" className="gicon" aria-hidden="true">
        {props.icon}
      </Text>
    </ActionIcon>
  );
}
