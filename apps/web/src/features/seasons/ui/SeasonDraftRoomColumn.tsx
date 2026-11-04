import { Button, Divider, Group, Stack, Text, Title } from "@ui";
import { Link } from "react-router-dom";

const BLOCKED_NOTE_ID = "season-draft-room-blocked-note";

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

  return (
    <Stack gap="sm">
      <Title order={3} variant="section">
        Draft room
      </Title>
      <Divider />
      <Group wrap="wrap">
        {draftId && !draftBoardBlocked ? (
          <Button component={Link} to={`/drafts/${draftId}`} variant="primary">
            {draftRoomCtaLabel}
          </Button>
        ) : (
          <Button
            disabled
            variant="primary"
            aria-describedby={draftBoardBlocked ? BLOCKED_NOTE_ID : undefined}
          >
            {draftRoomCtaLabel}
          </Button>
        )}
        {ceremonyId ? (
          <Button
            component={Link}
            to={`/ceremonies/${ceremonyId}/draft-plans`}
            variant="ghost"
          >
            Draft plans
          </Button>
        ) : (
          <Button disabled variant="ghost">
            Draft plans
          </Button>
        )}
      </Group>
      {draftBoardBlocked ? (
        <Text id={BLOCKED_NOTE_ID} variant="helper">
          Draft board is unavailable once results entry begins.
        </Text>
      ) : null}
    </Stack>
  );
}
