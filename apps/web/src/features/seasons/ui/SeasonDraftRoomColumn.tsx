import { Button, Divider, Group, Stack, Title } from "@ui";
import { Link } from "react-router-dom";

export function SeasonDraftRoomColumn(props: {
  draftId: number | null;
  ceremonyId: number | null;
  ceremonyStatus: string | null;
  draftStatus: string | null;
  draftRoomCtaLabel: string;
}) {
  const { draftId, ceremonyId, ceremonyStatus, draftStatus, draftRoomCtaLabel } = props;
  const ceremonyStatusNorm = String(ceremonyStatus ?? "").toUpperCase();
  const draftStatusNorm = String(draftStatus ?? "").toUpperCase();
  const draftBoardBlocked =
    draftStatusNorm === "CANCELLED" ||
    (ceremonyStatusNorm === "LOCKED" && draftStatusNorm !== "COMPLETED");
  const blockedTitle = draftBoardBlocked
    ? "Draft board is unavailable once results entry begins."
    : undefined;

  return (
    <Stack gap="sm">
      <Title order={3}>Draft room</Title>
      <Divider />
      <Group wrap="wrap">
        {draftId && !draftBoardBlocked ? (
          <Button component={Link} to={`/drafts/${draftId}`} variant="filled">
            {draftRoomCtaLabel}
          </Button>
        ) : (
          <Button disabled variant="filled" title={blockedTitle}>
            {draftRoomCtaLabel}
          </Button>
        )}
        {ceremonyId ? (
          <Button
            component={Link}
            to={`/ceremonies/${ceremonyId}/draft-plans`}
            variant="subtle"
          >
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
