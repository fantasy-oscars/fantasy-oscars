import { Divider, Stack, Text, Title } from "@ui";

export function SeasonRulesColumn(props: {
  scoringLabel: string;
  allocationLabel: string;
  draftTimerLabel: string;
  ceremonyTimeLabel: string;
}) {
  const { scoringLabel, allocationLabel, draftTimerLabel, ceremonyTimeLabel } = props;
  return (
    <Stack gap="sm">
      <Title order={3}>Rules</Title>
      <Divider />
      <Stack gap="var(--fo-space-8)">
        <Text>
          <Text component="span" className="muted">
            Scoring:
          </Text>{" "}
          {scoringLabel}
        </Text>
        <Text>
          <Text component="span" className="muted">
            Allocation:
          </Text>{" "}
          {allocationLabel}
        </Text>
        <Text>
          <Text component="span" className="muted">
            Draft timer:
          </Text>{" "}
          {draftTimerLabel}
        </Text>
        <Text>
          <Text component="span" className="muted">
            Ceremony time:
          </Text>{" "}
          {ceremonyTimeLabel}
        </Text>
      </Stack>
    </Stack>
  );
}
