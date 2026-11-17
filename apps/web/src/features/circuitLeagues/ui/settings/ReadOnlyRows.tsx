import { Box, Text } from "@ui";
import classes from "./Settings.module.css";

export type ReadOnlyRow = {
  key: string | number;
  label: string;
  detail?: string | null;
  value: string;
};

/** Saved values as text: label (and an optional detail line) beside the value. */
export function ReadOnlyRows(props: { rows: ReadOnlyRow[] }) {
  return (
    <Box component="dl" className={classes.readList}>
      {props.rows.map((r) => (
        <div key={r.key} className={classes.readRow}>
          <Box component="dt" miw="var(--fo-space-0)">
            <Text className="baseline-textBody baseline-wrapAnywhere">{r.label}</Text>
            {r.detail ? <Text variant="meta">{r.detail}</Text> : null}
          </Box>
          <Text component="dd" className={`baseline-textBody ${classes.readValue}`}>
            {r.value}
          </Text>
        </div>
      ))}
    </Box>
  );
}
