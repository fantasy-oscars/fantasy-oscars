import { useAdminCeremonyCircuitOrchestration } from "@/orchestration/adminCircuit";
import { AdminCeremonyCircuitScreen } from "@/features/admin/screens/ceremonies/AdminCeremonyCircuitScreen";

/** Circuit dates and associations, shown under the ceremony's Initialize step. */
export function AdminCeremonyCircuitPanel(props: { ceremonyId: number | null }) {
  const o = useAdminCeremonyCircuitOrchestration({ ceremonyId: props.ceremonyId });
  return (
    <AdminCeremonyCircuitScreen
      state={o.state}
      error={o.error}
      datesForm={o.datesForm}
      setDatesForm={o.setDatesForm}
      fieldErrors={o.fieldErrors}
      onEditField={o.clearFieldError}
      savingDates={o.savingDates}
      datesStatus={o.datesStatus}
      onSaveDates={() => void o.actions.saveDates()}
      associations={o.associations}
      circuitOptions={o.circuitOptions}
      working={o.working}
      associationStatus={o.associationStatus}
      onAssociate={o.actions.associate}
      onRemove={(circuitId) => void o.actions.remove(circuitId)}
    />
  );
}
