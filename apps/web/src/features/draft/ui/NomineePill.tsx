import { Box, Text } from "@ui";

type NomineeState = "default" | "active" | "picked" | "disabled";

export function NomineePill(props: {
  label: string;
  icon?: string | null;
  state?: NomineeState;
}) {
  const { label, icon, state = "default" } = props;
  return (
    <Box className="nominee-pill" data-state={state} title={label} aria-label={label}>
      {icon ? (
        <Text component="span" className="nominee-icon icon-code mono" aria-hidden="true">
          {icon}
        </Text>
      ) : null}
      <Text component="span" className="nominee-name">
        {label}
      </Text>
    </Box>
  );
}
