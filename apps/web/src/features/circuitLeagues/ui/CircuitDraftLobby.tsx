import { Box, Divider, Group, Stack, Text, Title } from "@ui";
import { FormStatus } from "@/shared/forms";
import type { ApiResult } from "@/lib/types";

export type CircuitLobbySummary = { title: string; line1: string; line2: string | null };

/**
 * Before the draft: when it starts, how it runs, who is in it and a summary
 * of the season's settings. The commissioner starts it from the room's
 * header, as in the ceremony draft room; a failed start is reported here.
 */
export function CircuitDraftLobby(props: {
  startNote: string;
  facts: Array<{ label: string; value: string }>;
  summaries: CircuitLobbySummary[];
  members: Array<{ userId: number; username: string; isViewer: boolean }>;
  startStatus: ApiResult | null;
  /** Why the draft cannot start yet (the season is not live); null once it can. */
  blockedLine?: string | null;
}) {
  return (
    <Stack gap="lg">
      <Stack gap="sm" component="section" aria-labelledby="circuit-lobby-start">
        <Title order={3} variant="section" id="circuit-lobby-start">
          Draft
        </Title>
        <Divider />
        {props.blockedLine ? (
          <Text
            className="baseline-textBody"
            fw="var(--fo-font-weight-semibold)"
            role="note"
          >
            {props.blockedLine}
          </Text>
        ) : null}
        <Text className="baseline-textBody">{props.startNote}</Text>
        <Box component="dl" className="circuit-lobbyFacts">
          {props.facts.map((fact) => (
            <Box key={fact.label} className="circuit-lobbyFact">
              <Text component="dt" variant="meta">
                {fact.label}
              </Text>
              <Text component="dd" className="baseline-textBody">
                {fact.value}
              </Text>
            </Box>
          ))}
        </Box>
        <FormStatus loading={false} result={props.startStatus} />
      </Stack>

      <Stack gap="sm" component="section" aria-labelledby="circuit-lobby-members">
        <Group justify="space-between" align="flex-end" wrap="wrap">
          <Title order={3} variant="section" id="circuit-lobby-members">
            Players
          </Title>
          <Text variant="meta">{props.members.length}</Text>
        </Group>
        <Divider />
        {props.members.length === 0 ? (
          <Text className="baseline-textBody">Nobody has joined yet.</Text>
        ) : (
          <Stack component="ul" gap="var(--fo-space-2)" className="fo-listReset">
            {props.members.map((m) => (
              <Text
                key={m.userId}
                component="li"
                className="baseline-textBody baseline-wrapAnywhere"
              >
                {m.isViewer ? `${m.username} (you)` : m.username}
              </Text>
            ))}
          </Stack>
        )}
      </Stack>

      <Stack gap="sm" component="section" aria-labelledby="circuit-lobby-settings">
        <Title order={3} variant="section" id="circuit-lobby-settings">
          Settings
        </Title>
        <Divider />
        {props.summaries.map((s) => (
          <Box key={s.title}>
            <Text variant="meta">{s.title}</Text>
            <Text className="baseline-textBody">{s.line1}</Text>
            {s.line2 ? (
              <Text variant="helper" className="baseline-textBody">
                {s.line2}
              </Text>
            ) : null}
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}
