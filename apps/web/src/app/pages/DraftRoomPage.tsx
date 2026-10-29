import { useParams } from "react-router-dom";
import { useAuthContext } from "@/auth/context";
import { useDraftRoomOrchestration } from "@/orchestration/draft";
import { DraftRoomScreen } from "@/features/draft/screens/DraftRoomScreen";
import { useMediaQuery } from "@ui/hooks";
import { FO_BP_MOBILE_MAX_PX } from "@/tokens/breakpoints";

export function DraftRoomPage() {
  const { user } = useAuthContext();
  // Keyed by user so stored preferences reload if the signed-in user changes.
  return <DraftRoomForUser key={user?.sub ?? "anon"} />;
}

function DraftRoomForUser() {
  const { id } = useParams();
  const { user } = useAuthContext();
  const isMobile = useMediaQuery(`(max-width: ${FO_BP_MOBILE_MAX_PX}px)`);
  const o = useDraftRoomOrchestration({
    initialDraftId: id,
    disabled: !user,
    disableCursorSpy: isMobile,
    preferencesUserKey: user?.sub ?? null
  });
  return <DraftRoomScreen o={o} />;
}
