import { useParams, useSearchParams } from "react-router-dom";
import { useAuthContext } from "@/auth/context";
import { useCircuitCeremonyBreakdownOrchestration } from "@/orchestration/circuitStandings";
import { CircuitScoreBreakdownScreen } from "@/features/circuitLeagues/screens/CircuitScoreBreakdownScreen";

function positiveInt(raw: string | null | undefined): number | null {
  const n = raw ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function CircuitScoreBreakdownPage() {
  const { fullSeasonId: circuitLeagueId, ceremonyId } = useParams();
  const [search, setSearch] = useSearchParams();
  const { user } = useAuthContext();
  const o = useCircuitCeremonyBreakdownOrchestration({
    circuitLeagueId: Number(circuitLeagueId),
    ceremonyId: Number(ceremonyId)
  });
  // The view is kept in the URL (`?view=category`), so Back and shared links keep it.
  const mode = search.get("view") === "category" ? "category" : "player";
  return (
    <CircuitScoreBreakdownScreen
      view={o.view}
      viewerUserId={positiveInt(user?.sub)}
      mode={mode}
      onModeChange={(next) =>
        setSearch(
          (prev) => {
            const params = new URLSearchParams(prev);
            if (next === "category") params.set("view", "category");
            else params.delete("view");
            return params;
          },
          { replace: true }
        )
      }
    />
  );
}
