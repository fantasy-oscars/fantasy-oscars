import { Button, Group, Stack, Text } from "@ui";
import { FormStatus } from "@/shared/forms";
import { circuitLeagueMembershipNote } from "@/decisions/circuitLeague";
import type { ApiResult } from "@/lib/types";

/** The viewer's own membership and its action, right under the header. */
export function CircuitLeagueMembershipBar(props: {
  open: boolean;
  canJoin: boolean;
  isMember: boolean;
  acting: boolean;
  status: ApiResult | null;
  onJoin: () => void;
  onLeave: () => void;
}) {
  const { open, canJoin, isMember, acting, status } = props;
  if (!canJoin && !isMember) return null;
  return (
    <Stack gap="xs">
      <Group gap="sm" align="center" wrap="wrap">
        <Text className="baseline-textBody">
          {circuitLeagueMembershipNote({ open, isMember })}
        </Text>
        {open && isMember ? (
          <Button variant="outline" onClick={props.onLeave} disabled={acting}>
            Leave season
          </Button>
        ) : null}
        {open && !isMember && canJoin ? (
          <Button onClick={props.onJoin} disabled={acting}>
            Join season
          </Button>
        ) : null}
      </Group>
      <FormStatus loading={false} result={status} />
    </Stack>
  );
}
