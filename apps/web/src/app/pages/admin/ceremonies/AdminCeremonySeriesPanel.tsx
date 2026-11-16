import { useAdminCeremonySeriesOrchestration } from "@/orchestration/adminSeries";
import { AdminCeremonySeriesScreen } from "@/features/admin/screens/ceremonies/AdminCeremonySeriesScreen";

/** Series dates and associations, shown under the ceremony's Initialize step. */
export function AdminCeremonySeriesPanel(props: { ceremonyId: number | null }) {
  const o = useAdminCeremonySeriesOrchestration({ ceremonyId: props.ceremonyId });
  return (
    <AdminCeremonySeriesScreen
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
      seriesOptions={o.seriesOptions}
      working={o.working}
      seriesStatus={o.seriesStatus}
      onAssociate={o.actions.associate}
      onRemove={(seriesId) => void o.actions.remove(seriesId)}
    />
  );
}
