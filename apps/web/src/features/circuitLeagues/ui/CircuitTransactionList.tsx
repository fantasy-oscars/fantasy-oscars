import { Box, Divider, Group, Stack, Text } from "@ui";
import {
  circuitInstantLabel,
  circuitSelectionCategoryLabel,
  circuitTransactionKindLabel
} from "@/decisions/circuitRoster";
import type { CircuitTransaction } from "@/lib/types";

/** The league's transactions, newest first: who, what kind, what was added and dropped. */
export function CircuitTransactionList(props: {
  transactions: CircuitTransaction[];
  categoryNames: ReadonlyMap<number, string>;
}) {
  const { transactions, categoryNames } = props;
  if (transactions.length === 0) {
    return <Text className="baseline-textBody">No transactions yet.</Text>;
  }
  return (
    <Stack
      component="ol"
      gap="var(--fo-space-0)"
      className="fo-listReset"
      aria-label="Transactions"
    >
      {transactions.map((t, idx) => (
        <Box key={t.id} component="li">
          <Stack gap="var(--fo-space-dense-2)" py="sm">
            <Group justify="space-between" align="baseline" wrap="wrap" gap="sm">
              <Text fw="var(--fo-font-weight-semibold)" className="baseline-wrapAnywhere">
                {t.member.username}
              </Text>
              <Text variant="meta">
                {circuitTransactionKindLabel(t.kind)} ·{" "}
                <time dateTime={t.occurred_at}>{circuitInstantLabel(t.occurred_at)}</time>
              </Text>
            </Group>
            {t.add ? (
              <Text className="baseline-textBody baseline-wrapAnywhere">
                Added {circuitSelectionCategoryLabel(t.add, categoryNames)}
              </Text>
            ) : null}
            {t.drop ? (
              <Text className="baseline-textBody baseline-wrapAnywhere">
                Dropped {circuitSelectionCategoryLabel(t.drop, categoryNames)}
              </Text>
            ) : null}
          </Stack>
          {idx === transactions.length - 1 ? null : <Divider />}
        </Box>
      ))}
    </Stack>
  );
}
