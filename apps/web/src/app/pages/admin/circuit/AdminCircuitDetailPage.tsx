import { useParams } from "react-router-dom";
import { useAdminCircuitDetailOrchestration } from "@/orchestration/adminCircuit";
import { AdminCircuitDetailScreen } from "@/features/admin/screens/circuit/AdminCircuitDetailScreen";

export function AdminCircuitDetailPage() {
  const { circuitId: circuitIdRaw } = useParams();
  const parsed = circuitIdRaw ? Number(circuitIdRaw) : NaN;
  const circuitId = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  const o = useAdminCircuitDetailOrchestration({ circuitId });
  const a = o.actions;
  return (
    <AdminCircuitDetailScreen
      state={o.state}
      error={o.error}
      detail={o.detail}
      ceremonies={o.ceremonies}
      templates={o.templates}
      mappingChoices={o.mappingChoices}
      working={o.working}
      status={o.status}
      activationMissing={o.activationMissing}
      ceremonyActions={{
        place: a.placeCeremony,
        remove: (ceremonyId) => void a.removeCeremony(ceremonyId),
        createEvent: a.createEvent,
        renameEvent: a.renameEvent,
        moveEvent: (eventId, delta) => void a.moveEvent(eventId, delta),
        ungroupEvent: (eventId) => void a.ungroupEvent(eventId)
      }}
      categoryActions={{
        add: a.addCategory,
        rename: a.renameCategory,
        move: (categoryId, delta) => void a.moveCategory(categoryId, delta),
        remove: (categoryId) => void a.removeCategory(categoryId)
      }}
      mappingActions={{
        choose: a.chooseMapping,
        save: () => void a.saveMappings()
      }}
      onActivate={() => void a.activate()}
    />
  );
}
