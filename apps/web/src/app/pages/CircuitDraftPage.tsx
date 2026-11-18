import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuthContext } from "@/auth/context";
import {
  useCircuitDraftOrchestration,
  type CircuitDraftOrchestration
} from "@/orchestration/circuitDraft";
import { useContenderPickerOrchestration } from "@/orchestration/contenders";
import { useDraftRoomPreferences } from "@/orchestration/draft/useDraftRoomPreferences";
import type { ContenderPickerProps } from "@/features/contenders/ui/ContenderPicker";
import { CircuitDraftScreen } from "@/features/circuitLeagues/screens/CircuitDraftScreen";
import type { CircuitSelectionSummary } from "@/lib/types";

type Intent = "draft" | "queue" | "stage";

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

  // The form mounts once the season (and so its Circuit) is known and the
  // viewer keeps a queue.
  return circuitId === null ? (
    <DraftScreen o={o} viewerUserId={viewerUserId} picker={null} />
  ) : (
    <DraftWithPicker
      key={circuitId}
      circuitId={circuitId}
      o={o}
      viewerUserId={viewerUserId}
    />
  );
}

/**
 * One contender form for every action: the button pressed sets the intent,
 * the form resolves the contender, and the intent decides what happens to it.
 * A refused action keeps the choice for another try.
 */
function DraftWithPicker(props: {
  circuitId: number;
  o: CircuitDraftOrchestration;
  viewerUserId: number | null;
}) {
  const { o } = props;
  const intentRef = useRef<Intent>("queue");
  // Whether the form resolved the contender; a failed lookup never does.
  const resolvedRef = useRef(false);
  const [intent, setIntent] = useState<Intent | null>(null);
  const picker = useContenderPickerOrchestration({
    circuitId: props.circuitId,
    onPicked: (selection) => {
      resolvedRef.current = true;
      const run: (s: CircuitSelectionSummary) => Promise<boolean> =
        intentRef.current === "draft"
          ? o.draftSelection
          : intentRef.current === "stage"
            ? o.stageSelection
            : o.addToQueue;
      void run(selection).then((done) => {
        setIntent(null);
        if (done) picker.actions.startOver();
      });
    }
  });
  const live =
    o.view.state === "ready" && (o.view.phase === "live" || o.view.phase === "paused");
  const canPick = o.view.state === "ready" && Boolean(o.view.gate?.canPick);
  const busy = picker.picking || intent !== null;
  const choose = (next: Intent) => () => {
    intentRef.current = next;
    resolvedRef.current = false;
    setIntent(next);
    void picker.actions.pick().then(() => {
      // The form shows its own error for a failed lookup.
      if (!resolvedRef.current) setIntent(null);
    });
  };
  const action = (verb: string, id: Intent, disabled = false) => ({
    verb,
    onConfirm: choose(id),
    disabled,
    loading: busy && intent === id
  });
  const form: ContenderPickerProps = {
    ...picker,
    picking: busy,
    picked: null,
    confirmActions: [
      ...(live ? [action("Draft", "draft", !canPick)] : []),
      action("Queue", "queue"),
      action("Stage", "stage")
    ]
  };
  return <DraftScreen o={o} viewerUserId={props.viewerUserId} picker={form} />;
}

function DraftScreen(props: {
  o: CircuitDraftOrchestration;
  viewerUserId: number | null;
  picker: ContenderPickerProps | null;
}) {
  const { o } = props;
  const { user } = useAuthContext();
  const { preferences, updatePreferences } = useDraftRoomPreferences(props.viewerUserId);
  return (
    <CircuitDraftScreen
      view={o.view}
      viewerUserId={props.viewerUserId}
      viewerLabel={user?.username ?? user?.sub ?? "—"}
      viewerAvatarKey={user?.avatar_key ?? null}
      picker={props.picker}
      connection={o.connection}
      connectionState={o.connectionState}
      clock={o.clock}
      pickStatus={o.pickStatus}
      picking={o.picking}
      pauseStatus={o.pauseStatus}
      onTogglePause={o.togglePause}
      queueBusy={o.queueBusy}
      removingSelectionId={o.removingSelectionId}
      queueStatus={o.queueStatus}
      startStatus={o.startStatus}
      onStart={o.startDraft}
      onDraft={o.draftSelection}
      onRemoveFromQueue={o.removeFromQueue}
      onReorderQueue={o.reorderQueue}
      onQueue={(selection) => void o.addToQueue(selection)}
      onStage={(selection) => void o.stageSelection(selection)}
      onUnstage={o.unstage}
      soundEnabled={preferences.soundEnabled}
      onToggleSound={() => updatePreferences({ soundEnabled: !preferences.soundEnabled })}
      railPreferences={preferences.rails}
      onRailOpenChange={(rail, open) => updatePreferences({ rails: { [rail]: open } })}
    />
  );
}
