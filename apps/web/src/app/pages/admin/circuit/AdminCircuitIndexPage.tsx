import { useNavigate } from "react-router-dom";
import { useAdminCircuitIndexOrchestration } from "@/orchestration/adminCircuit";
import { AdminCircuitIndexScreen } from "@/features/admin/screens/circuit/AdminCircuitIndexScreen";

export function AdminCircuitIndexPage() {
  const navigate = useNavigate();
  const o = useAdminCircuitIndexOrchestration();
  return (
    <AdminCircuitIndexScreen
      state={o.state}
      error={o.error}
      circuits={o.circuits}
      form={o.form}
      setForm={o.setForm}
      fieldErrors={o.fieldErrors}
      onEditField={o.clearFieldError}
      creating={o.creating}
      status={o.status}
      onCreate={() => {
        void o.actions.create().then((res) => {
          if (res.ok && res.circuitId) navigate(`/admin/circuits/${res.circuitId}`);
        });
      }}
    />
  );
}
