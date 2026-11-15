import { Box, Text } from "@ui";
import type { HeaderStatus } from "@/decisions/draft/headerStatus";
import { podiumAriaLabel, podiumKicker, type PodiumCell } from "@/decisions/draft/podium";
import { usePodiumCycle } from "@/orchestration/draft/usePodiumCycle";
import { TabularText } from "@/ui/TabularText";

function StatCell(props: { label: string; value: number | null; blank: boolean }) {
  return (
    <Box className="drh-tabStat">
      <Text className="drh-tabStatLabel">{props.label}</Text>
      <Text className="drh-tabStatNumber">
        {props.blank ? "—" : (props.value ?? "—")}
      </Text>
    </Box>
  );
}

/**
 * Final results: one flush cell per place, each on its metal. DOM order is 1st, 2nd,
 * 3rd; CSS places the cells 2nd, 1st, 3rd when there are three.
 */
function PodiumCells(props: { podium: PodiumCell[] }) {
  const { tick, animate } = usePodiumCycle(props.podium);
  return (
    <>
      {props.podium.map((cell) => {
        const index = cell.names.length > 1 ? tick % cell.names.length : 0;
        const name = cell.names[index] ?? "";
        return (
          <Box
            key={cell.place}
            className="drh-tabPlace"
            role="group"
            aria-label={podiumAriaLabel(cell)}
            data-place={cell.place}
          >
            <Text className="drh-tabKicker" data-kind="label">
              {podiumKicker(cell.place, cell.names.length > 1)}
            </Text>
            <Text
              key={`${cell.place}-${index}`}
              className="drh-tabPlaceName"
              data-rolling={animate && cell.names.length > 1 ? "true" : undefined}
              aria-hidden="true"
              title={name}
            >
              {name}
            </Text>
          </Box>
        );
      })}
    </>
  );
}

/**
 * The status tab that hangs from the top of the screen between the header wings. Its
 * width is set by CSS alone; nothing here changes it. It is a labelled group, not a
 * live region: changes are announced by the room's live region instead.
 */
export function DraftHeaderTab(props: {
  status: HeaderStatus;
  roundNumber: number | null;
  pickNumber: number | null;
  /** Resolved podium places; shown when the status tone is `final`. */
  podium: PodiumCell[];
}) {
  const { status } = props;
  if (status.tone === "final" && props.podium.length > 0) {
    return (
      <Box
        className="drh-tab"
        role="group"
        aria-label="Draft status"
        data-tone="final"
        data-stats="off"
        data-podium={props.podium.length}
      >
        <PodiumCells podium={props.podium} />
      </Box>
    );
  }
  const headline =
    status.headlineKind === "clock" ? (
      <TabularText text={status.headline} className="drh-tabHeadlineText" />
    ) : (
      <Text component="span" className="drh-tabHeadlineText">
        {status.headline}
      </Text>
    );

  return (
    <Box
      className="drh-tab"
      role="group"
      aria-label="Draft status"
      data-tone={status.tone}
      data-stats={status.showStats ? "on" : "off"}
    >
      {status.showStats ? (
        <StatCell label="Round" value={props.roundNumber} blank={status.statsBlank} />
      ) : null}
      <Box className="drh-tabCenter">
        {status.kicker ? (
          <Text
            className="drh-tabKicker"
            data-kind={status.kickerKind}
            title={status.kicker}
          >
            {status.kicker}
          </Text>
        ) : null}
        <Box
          className="drh-tabHeadline"
          data-kind={status.headlineKind}
          title={status.headline}
        >
          {status.glyph ? (
            <Text component="span" className="mi-icon drh-tabGlyph" aria-hidden="true">
              {status.glyph}
            </Text>
          ) : null}
          {headline}
        </Box>
      </Box>
      {status.showStats ? (
        <StatCell label="Pick" value={props.pickNumber} blank={status.statsBlank} />
      ) : null}
    </Box>
  );
}
