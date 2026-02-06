import { useParams } from "react-router-dom";
import { DraftRoomScreen } from "../../screens/draft/DraftRoomScreen";
import { useDraftPreviewOrchestration } from "../../orchestration/draftPreview";

export function DraftCeremonyPreviewPage() {
  const { ceremonyId: raw } = useParams();
  const ceremonyIdParsed = raw ? Number(raw) : NaN;
  const ceremonyId =
    Number.isFinite(ceremonyIdParsed) && ceremonyIdParsed > 0 ? ceremonyIdParsed : null;

  const o = useDraftPreviewOrchestration({ ceremonyId });
  return <DraftRoomScreen o={o} />;
}

