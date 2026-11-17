import { Box, Stack, Text, Title } from "@ui";
import { EmptyState } from "@/primitives";
import {
  circuitScheduleTimeline,
  scheduleDayLabel,
  scheduleOccasionLabel,
  scheduleWindowRange
} from "@/decisions/admin/circuitSchedule";
import type {
  CircuitCeremony,
  ScoringOccasion,
  WaiverWindow
} from "@/orchestration/adminCircuit";

/**
 * A read-only timeline. Left: each ceremony's nominations and ceremony
 * dates. Right: the add/drop windows those days open, as if every ceremony
 * were enabled. Ceremonies without dates are listed apart.
 */
export function CircuitScheduleTab(props: {
  ceremonies: CircuitCeremony[];
  occasions: ScoringOccasion[];
  windows: WaiverWindow[];
}) {
  const { days, undated } = circuitScheduleTimeline(
    props.ceremonies,
    props.occasions,
    props.windows
  );

  return (
    <Box>
      <Text className="muted">
        Scoring days on the left. On the right, the add/drop windows they open, counted as
        if every ceremony were enabled: a league that disables some ceremonies gets fewer
        windows. Windows resolve at midnight Pacific time after their last day.
      </Text>

      {days.length === 0 ? (
        <Box mt="md">
          <EmptyState>
            {props.ceremonies.length === 0
              ? "No ceremonies yet."
              : "No dates yet. Set them on each ceremony's admin page."}
          </EmptyState>
        </Box>
      ) : (
        <>
          <Box className="circuit-timelineHead" aria-hidden="true" mt="md">
            <Text className="muted" size="sm" fw="var(--fo-font-weight-bold)">
              Scoring days
            </Text>
            <Text className="muted" size="sm" fw="var(--fo-font-weight-bold)">
              Add/drop windows (every ceremony enabled)
            </Text>
          </Box>
          <Box component="ol" className="circuit-timeline fo-listReset" mt="sm">
            {days.map((day) => (
              <Box key={day.date} component="li" className="circuit-timelineDay">
                <Box className="circuit-timelineSide circuit-timelineScoring">
                  {day.scoring.map((s) => (
                    <Box key={`${s.ceremonyId}-${s.kind}`}>
                      <Text fw="var(--fo-font-weight-bold)">
                        {s.ceremonyLabel} · {scheduleOccasionLabel(s.kind)}
                      </Text>
                      {s.groupName ? (
                        <Text className="muted" size="sm">
                          {s.groupName}
                        </Text>
                      ) : null}
                    </Box>
                  ))}
                </Box>
                <Box className="circuit-timelineMarker">
                  <Box component="span" className="circuit-timelineDot" />
                  <Text component="time" dateTime={day.date} size="sm" className="muted">
                    {scheduleDayLabel(day.date)}
                  </Text>
                </Box>
                <Box className="circuit-timelineSide circuit-timelineWindows">
                  {day.windows.map((w) => (
                    <Box key={w.startsOn} className="circuit-timelineWindow">
                      <Text fw="var(--fo-font-weight-bold)">
                        <Text component="span" className="circuit-timelineTag" size="sm">
                          Add/drop window
                        </Text>{" "}
                        {scheduleWindowRange(w)}
                      </Text>
                      <Text className="muted" size="sm">
                        Resolves {scheduleDayLabel(w.resolvesOn)}, 00:00 PT
                      </Text>
                    </Box>
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
        </>
      )}

      {undated.length > 0 ? (
        <Box mt="lg" component="section" aria-labelledby="circuit-needs-dates-title">
          <Title order={4} variant="section" id="circuit-needs-dates-title">
            Needs dates
          </Title>
          <Stack component="ul" gap="xs" mt="xs" className="fo-listReset">
            {undated.map((u) => (
              <Box key={u.ceremonyId} component="li">
                <Text>
                  {u.ceremonyLabel}
                  {u.groupName ? ` · ${u.groupName}` : ""}
                </Text>
                <Text className="muted" size="sm">
                  Missing:{" "}
                  {u.missing.map(scheduleOccasionLabel).join(" and ").toLowerCase()} date
                </Text>
              </Box>
            ))}
          </Stack>
        </Box>
      ) : null}
    </Box>
  );
}
