import type { ReactNode } from "react";
import { Box, Divider, Group, NumberInput, Text } from "@ui";
import { settingsErrorId, settingsFieldId } from "./dom";
import classes from "./Settings.module.css";

/**
 * A list row in a settings modal: the name (or a switch) on the left and a
 * short number input on the right. An error message runs full width under the
 * row, because the 7rem column cannot hold it.
 */
export function SettingsListRow(props: {
  fieldKey: string;
  left: ReactNode;
  ariaLabel: string;
  value: number | string;
  error: string | undefined;
  decimal: boolean;
  min: number;
  max: number;
  step?: number;
  placeholder?: string;
  disabled?: boolean;
  readOnly: boolean;
  last: boolean;
  onChange: (value: number | string) => void;
  onBlur: () => void;
}) {
  const { fieldKey, error } = props;
  return (
    <Box component="li">
      <Group justify="space-between" align="center" wrap="nowrap" gap="md" py="xs">
        <Box className={classes.rowText}>{props.left}</Box>
        <NumberInput
          hideControls
          id={settingsFieldId(fieldKey)}
          aria-label={props.ariaLabel}
          inputMode={props.decimal ? "decimal" : "numeric"}
          allowDecimal={props.decimal}
          allowNegative={false}
          min={props.min}
          max={props.max}
          step={props.step}
          clampBehavior="none"
          placeholder={props.placeholder}
          value={props.value}
          // The input's own error element carries the message for assistive
          // technology; the visible copy runs full width under the row.
          error={error}
          errorProps={{ id: settingsErrorId(fieldKey), className: classes.srOnly }}
          disabled={props.disabled}
          readOnly={props.readOnly}
          onChange={props.onChange}
          onBlur={props.onBlur}
          className={classes.numberCell}
        />
      </Group>
      {error ? (
        <Text
          aria-hidden="true"
          c="var(--mantine-color-error)"
          fz="var(--fo-font-size-sm)"
          pb="xs"
        >
          {error}
        </Text>
      ) : null}
      {props.last ? null : <Divider />}
    </Box>
  );
}
