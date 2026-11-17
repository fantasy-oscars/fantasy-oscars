import { Box, Button, Divider, Group, Skeleton, Stack, Text, VisuallyHidden } from "@ui";
import type { AreaMode, SettingsArea } from "@/decisions/fullSeasonSettings";
import { SETTINGS_AREA_TITLES } from "@/decisions/fullSeasonSettings";
import classes from "./Settings.module.css";
import type { AreaSummary } from "@/decisions/fullSeasonSummary";

export type SummaryRow = {
  area: SettingsArea;
  mode: AreaMode;
  /** "loading" shows skeleton lines, "unloaded" says "Not loaded"; both disable the button. */
  state: "ready" | "loading" | "unloaded";
  summary: AreaSummary;
};

/** One row per settings area: its name, a short summary, and Edit or View. */
export function SettingsSummaryRows(props: {
  rows: SummaryRow[];
  onOpen: (area: SettingsArea) => void;
}) {
  const { rows, onOpen } = props;
  return (
    <Stack component="ul" gap="var(--fo-space-0)" className="fo-listReset">
      {rows.map((row, idx) => {
        const title = SETTINGS_AREA_TITLES[row.area];
        const summaryId = `fs-summary-${row.area}`;
        const disabled = row.state !== "ready" || row.summary.empty;
        const label = row.mode === "edit" ? "Edit" : "View";
        return (
          <Box key={row.area} component="li">
            <Group
              justify="space-between"
              align="flex-start"
              wrap="nowrap"
              gap="md"
              py="sm"
            >
              <Box className={classes.rowText}>
                <Text className="baseline-textBody" fw="var(--fo-font-weight-semibold)">
                  {title}
                </Text>
                {row.state === "loading" ? (
                  <Stack gap="var(--fo-space-dense-2)" mt="var(--fo-space-dense-2)">
                    <Skeleton height="var(--fo-font-size-sm)" width="60%" />
                    <Skeleton height="var(--fo-font-size-sm)" width="40%" />
                  </Stack>
                ) : (
                  <Box id={summaryId}>
                    <Text className="baseline-textBody baseline-wrapAnywhere">
                      {row.state === "unloaded" ? "Not loaded" : row.summary.line1}
                    </Text>
                    {row.state === "ready" && row.summary.line2 ? (
                      <Text variant="meta" className="baseline-wrapAnywhere">
                        {row.summary.line2}
                      </Text>
                    ) : null}
                  </Box>
                )}
              </Box>
              <Button
                type="button"
                variant="secondary"
                className={classes.rowAction}
                disabled={disabled}
                aria-describedby={row.summary.empty ? summaryId : undefined}
                onClick={() => onOpen(row.area)}
              >
                {label}{" "}
                <VisuallyHidden component="span">{title.toLowerCase()}</VisuallyHidden>
              </Button>
            </Group>
            {idx === rows.length - 1 ? null : <Divider />}
          </Box>
        );
      })}
    </Stack>
  );
}
