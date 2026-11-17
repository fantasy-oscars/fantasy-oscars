import { Stack, Text } from "@ui";
import { StandardCard } from "@/primitives";
import type { SettingsArea } from "@/decisions/fullSeasonSettings";
import { SettingsHeading } from "./SettingsHeading";
import { SettingsSummaryRows, type SummaryRow } from "./SettingsSummaryRows";

/** The season page's settings: a summary per area, each opening its modal. */
export function FullSeasonSettingsCard(props: {
  helper: string | null;
  statusLine: string;
  rows: SummaryRow[];
  onOpen: (area: SettingsArea) => void;
}) {
  return (
    <StandardCard component="section" aria-label="Season settings">
      <Stack gap="sm">
        <SettingsHeading statusLine={props.statusLine} />
        {props.helper ? <Text variant="helper">{props.helper}</Text> : null}
        <SettingsSummaryRows rows={props.rows} onOpen={props.onOpen} />
      </Stack>
    </StandardCard>
  );
}
