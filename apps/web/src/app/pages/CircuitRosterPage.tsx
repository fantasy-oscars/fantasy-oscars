import { useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useAuthContext } from "@/auth/context";
import {
  useCircuitRosterOrchestration,
  type CircuitRosterOrchestration
} from "@/orchestration/circuitRoster";
import { useContenderPickerOrchestration } from "@/orchestration/contenders";
import { CircuitRosterScreen } from "@/features/circuitLeagues/screens/CircuitRosterScreen";

function positiveInt(raw: string | null | undefined): number | null {
  const n = raw ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function CircuitRosterPage() {
  const { circuitLeagueId } = useParams();
  const [search, setSearch] = useSearchParams();
  const { user } = useAuthContext();
  const viewerUserId = positiveInt(user?.sub);
  const memberUserId = positiveInt(search.get("member"));
  const o = useCircuitRosterOrchestration({
    circuitLeagueId: Number(circuitLeagueId),
    memberUserId,
    viewerUserId
  });
  const onSelectMember = useCallback(
    (userId: number | null) =>
      setSearch(userId === null ? {} : { member: String(userId) }, { replace: true }),
    [setSearch]
  );
  const circuitId =
    o.view.state === "ready" && o.view.writable
      ? o.view.detail.circuit_league.circuit_id
      : null;

  // The picker mounts once the season (and so its Circuit) is known.
  return circuitId === null ? (
    <RosterScreen
      o={o}
      picker={null}
      memberUserId={memberUserId}
      viewerUserId={viewerUserId}
      onSelectMember={onSelectMember}
    />
  ) : (
    <RosterWithPicker
      key={circuitId}
      circuitId={circuitId}
      o={o}
      memberUserId={memberUserId}
      viewerUserId={viewerUserId}
      onSelectMember={onSelectMember}
    />
  );
}

type ScreenInput = {
  o: CircuitRosterOrchestration;
  memberUserId: number | null;
  viewerUserId: number | null;
  onSelectMember: (userId: number | null) => void;
};

function RosterWithPicker(props: ScreenInput & { circuitId: number }) {
  const { o } = props;
  const picker = useContenderPickerOrchestration({
    circuitId: props.circuitId,
    onPicked: (selection) => {
      void o.addFreeAgent(selection).then((added) => {
        if (added) picker.actions.startOver();
      });
    }
  });
  return (
    <RosterScreen
      {...props}
      picker={picker}
      onRetryAdd={() => {
        void o.retryPending().then((added) => {
          if (added) picker.actions.startOver();
        });
      }}
    />
  );
}

function RosterScreen(
  props: ScreenInput & {
    picker: ReturnType<typeof useContenderPickerOrchestration> | null;
    onRetryAdd?: () => void;
  }
) {
  const { o } = props;
  return (
    <CircuitRosterScreen
      view={o.view}
      memberUserId={props.memberUserId}
      viewerUserId={props.viewerUserId}
      picker={props.picker}
      pending={o.pending}
      dropSelectionId={o.dropSelectionId}
      dropOptions={o.dropOptions}
      adding={o.adding}
      droppingSelectionId={o.droppingSelectionId}
      addStatus={o.addStatus}
      dropStatus={o.dropStatus}
      onSelectMember={props.onSelectMember}
      onChooseDrop={o.chooseDrop}
      onRetryAdd={props.onRetryAdd ?? (() => void o.retryPending())}
      onCancelAdd={o.cancelPending}
      onDrop={o.drop}
    />
  );
}
