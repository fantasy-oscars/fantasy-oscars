import { Button, Divider, Group, Stack, Title } from "@ui";
import { Link } from "react-router-dom";

export function SeasonDraftRoomColumn(props: {
  draftId: number | null;
  ceremonyId: number | null;
  draftRoomCtaLabel: string;
}) {
  const { draftId, ceremonyId, draftRoomCtaLabel } = props;
  return (
    <Stack gap="sm">
      <Title order={3}>Draft room</Title>
      <Divider />
      <Group wrap="wrap">
        {draftId ? (
          <Button component={Link} to={`/drafts/${draftId}`} variant="filled">
            {draftRoomCtaLabel}
          </Button>
        ) : (
          <Button disabled variant="filled">
            {draftRoomCtaLabel}
          </Button>
        )}
        {ceremonyId ? (
          <Button component={Link} to={`/ceremonies/${ceremonyId}/draft-plans`} variant="subtle">
            Draft plans
          </Button>
        ) : (
          <Button disabled variant="subtle">
            Draft plans
          </Button>
        )}
      </Group>
    </Stack>
  );
}

