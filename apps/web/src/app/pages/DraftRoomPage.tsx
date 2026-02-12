import { useParams } from "react-router-dom";
import { useAuthContext } from "@/auth/context";
import { useDraftRoomOrchestration } from "@/orchestration/draft";
import { DraftRoomScreen } from "@/screens/draft/DraftRoomScreen";

export function DraftRoomPage() {
  const { id } = useParams();
  const { user } = useAuthContext();
  const o = useDraftRoomOrchestration({ initialDraftId: id, disabled: !user });
  return <DraftRoomScreen o={o} />;
}
