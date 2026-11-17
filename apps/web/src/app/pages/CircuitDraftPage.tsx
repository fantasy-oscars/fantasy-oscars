import { useParams } from "react-router-dom";
import { useAuthContext } from "@/auth/context";
import {
  useCircuitDraftOrchestration,
  type CircuitDraftOrchestration
} from "@/orchestration/circuitDraft";
import { useContenderPickerOrchestration } from "@/orchestration/contenders";
import { CircuitDraftScreen } from "@/features/circuitLeagues/screens/CircuitDraftScreen";

function positiveInt(raw: string | null | undefined): number | null {
  const n = raw ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function CircuitDraftPage() {
  const { fullSeasonId: circuitLeagueId } = useParams();
  const { user } = useAuthContext();
  const viewerUserId = positiveInt(user?.sub);
  const o = useCircuitDraftOrchestration({
    circuitLeagueId: Number(circuitLeagueId),
    viewerUserId
  });
  const circuitId =
    o.view.state === "ready" && o.view.queue !== null
      ? o.view.detail.circuit_league.circuit_id
      : null;

  // The pickers mount once the season (and so its Circuit) is known and the
  // viewer keeps a queue: one adds to the queue, one drafts.
  return circuitId === null ? (
    <DraftScreen o={o} viewerUserId={viewerUserId} picker={null} draftPicker={null} />
  ) : (
    <DraftWithPicker
      key={circuitId}
      circuitId={circuitId}
      o={o}
      viewerUserId={viewerUserId}
    />
  );
}

function DraftWithPicker(props: {
  circuitId: number;
  o: CircuitDraftOrchestration;
  viewerUserId: number | null;
}) {
  const { o } = props;
  const picker = useContenderPickerOrchestration({
    circuitId: props.circuitId,
    onPicked: (selection) => {
      void o.addToQueue(selection).then((added) => {
        if (added) picker.actions.startOver();
      });
    }
  });
  const draftPicker = useContenderPickerOrchestration({
    circuitId: props.circuitId,
    onPicked: (selection) => {
      void o.draftSelection(selection).then((drafted) => {
        if (drafted) draftPicker.actions.startOver();
      });
    }
  });
  const live =
    o.view.state === "ready" && (o.view.phase === "live" || o.view.phase === "paused");
  return (
    <DraftScreen
      o={o}
      viewerUserId={props.viewerUserId}
      picker={picker}
      // The pick is made only once the draft accepts it: the button stays
      // busy until then, and a refused pick keeps the choice for another try.
      draftPicker={
        live
          ? { ...draftPicker, picking: draftPicker.picking || o.picking, picked: null }
          : null
      }
    />
  );
}

function DraftScreen(props: {
  o: CircuitDraftOrchestration;
  viewerUserId: number | null;
  picker: ReturnType<typeof useContenderPickerOrchestration> | null;
  draftPicker: ReturnType<typeof useContenderPickerOrchestration> | null;
}) {
  const { o } = props;
  return (
    <CircuitDraftScreen
      view={o.view}
      viewerUserId={props.viewerUserId}
      picker={props.picker}
      draftPicker={props.draftPicker}
      connection={o.connection}
      connectionState={o.connectionState}
      clock={o.clock}
      pickStatus={o.pickStatus}
      pausing={o.pausing}
      pauseStatus={o.pauseStatus}
      onTogglePause={o.togglePause}
      queueBusy={o.queueBusy}
      removingSelectionId={o.removingSelectionId}
      queueStatus={o.queueStatus}
      starting={o.starting}
      startStatus={o.startStatus}
      onRemoveFromQueue={o.removeFromQueue}
      onReorderQueue={o.reorderQueue}
      onStart={o.startDraft}
    />
  );
}
