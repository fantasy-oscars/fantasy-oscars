import { useParams } from "react-router-dom";
import { useAuthContext } from "../auth/context";
import { DraftRoom } from "../features/draft/DraftRoom";

export function DraftRoomPage() {
  const { id } = useParams();
  const { user } = useAuthContext();
  return <DraftRoom initialDraftId={id} disabled={!user} />;
}
