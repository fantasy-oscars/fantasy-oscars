import { useParams, useSearchParams } from "react-router-dom";
import { useAdminCircuitDetailOrchestration } from "@/orchestration/adminCircuit";
import { AdminCircuitDetailScreen } from "@/features/admin/screens/circuit/AdminCircuitDetailScreen";
import {
  CIRCUIT_EDITOR_TABS,
  type CircuitEditorTab
} from "@/features/admin/ui/circuit/CircuitEditorTabs";

export function AdminCircuitDetailPage() {
  const { circuitId: circuitIdRaw } = useParams();
  const parsed = circuitIdRaw ? Number(circuitIdRaw) : NaN;
  const circuitId = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  // The open tab lives in the URL so a reload or a shared link keeps it.
  const [search, setSearch] = useSearchParams();
  const tab =
    CIRCUIT_EDITOR_TABS.find((t) => t.value === search.get("tab"))?.value ?? "categories";
  const o = useAdminCircuitDetailOrchestration({ circuitId });
  const a = o.actions;
  return (
    <AdminCircuitDetailScreen
      state={o.state}
      error={o.error}
      detail={o.detail}
      readiness={o.readiness}
      ceremonies={o.ceremonies}
      templates={o.templates}
      iconCodes={o.iconCodes}
      working={o.working}
      status={o.status}
      activationMissing={o.activationMissing}
      tab={tab}
      onTabChange={(next: CircuitEditorTab) =>
        setSearch(
          (prev) => {
            const params = new URLSearchParams(prev);
            params.set("tab", next);
            return params;
          },
          { replace: true }
        )
      }
      ceremonyActions={{
        add: a.addCeremony,
        remove: (ceremonyId) => void a.removeCeremony(ceremonyId),
        addGroup: a.addGroup,
        renameGroup: a.renameGroup,
        deleteGroup: (eventId) => void a.deleteGroup(eventId),
        applyLayout: a.applyLayout,
        saveMappings: a.saveMappings
      }}
      categoryActions={{
        add: a.addCategory,
        rename: a.renameCategory,
        setIcon: a.setCategoryIcon,
        reorder: a.reorderCategories,
        remove: (categoryId) => void a.removeCategory(categoryId)
      }}
      onActivate={() => void a.activate()}
    />
  );
}
