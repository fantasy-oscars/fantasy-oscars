import { useParams } from "react-router-dom";
import { useMediaQuery } from "@ui/hooks";
import { useAuthContext } from "@/auth/context";
import {
  useCircuitWaiversOrchestration,
  type CircuitWaiversOrchestration
} from "@/orchestration/circuitWaivers";
import { useContenderPickerOrchestration } from "@/orchestration/contenders";
import { CircuitWaiversScreen } from "@/features/circuitLeagues/screens/CircuitWaiversScreen";
import { SETTINGS_PHONE_QUERY } from "@/features/circuitLeagues/ui/settings/dom";

function positiveInt(raw: string | null | undefined): number | null {
  const n = raw ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function CircuitWaiversPage() {
  const { fullSeasonId: circuitLeagueId } = useParams();
  const { user } = useAuthContext();
  const viewerUserId = positiveInt(user?.sub);
  const phone = useMediaQuery(SETTINGS_PHONE_QUERY, false, {
    getInitialValueInEffect: false
  });
  const o = useCircuitWaiversOrchestration({ circuitLeagueId: Number(circuitLeagueId) });
  const circuitId =
    o.view.state === "ready" && o.view.canClaim
      ? o.view.detail.circuit_league.circuit_id
      : null;

  // The picker mounts once the viewer can claim (and so the Circuit is known).
  return circuitId === null ? (
    <WaiversScreen o={o} picker={null} viewerUserId={viewerUserId} phone={phone} />
  ) : (
    <WaiversWithPicker
      key={circuitId}
      circuitId={circuitId}
      o={o}
      viewerUserId={viewerUserId}
      phone={phone}
    />
  );
}

type ScreenInput = {
  o: CircuitWaiversOrchestration;
  viewerUserId: number | null;
  phone: boolean;
};

function WaiversWithPicker(props: ScreenInput & { circuitId: number }) {
  const { o } = props;
  const picker = useContenderPickerOrchestration({
    circuitId: props.circuitId,
    onPicked: (selection) => {
      // The claim's options are set in the modal; the picker starts over either way.
      o.startClaim(selection);
      picker.actions.startOver();
    }
  });
  return <WaiversScreen {...props} picker={picker} />;
}

function WaiversScreen(
  props: ScreenInput & {
    picker: ReturnType<typeof useContenderPickerOrchestration> | null;
  }
) {
  const { o } = props;
  return (
    <CircuitWaiversScreen
      view={o.view}
      viewerUserId={props.viewerUserId}
      picker={props.picker}
      phone={props.phone}
      draft={o.draft}
      dropOptions={o.dropOptions}
      chipOptions={o.chipOptions}
      warning={o.warning}
      dropError={o.dropError}
      saving={o.saving}
      busy={o.busy}
      modalStatus={o.modalStatus}
      listStatus={o.listStatus}
      onReorder={o.reorder}
      onEdit={o.editClaim}
      onWithdraw={o.withdraw}
      onChangeDraft={o.changeDraft}
      onCloseClaim={o.closeClaim}
      onSaveClaim={o.saveClaim}
    />
  );
}
