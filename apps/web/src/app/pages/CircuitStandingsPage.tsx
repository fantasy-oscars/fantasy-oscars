import { useParams, useSearchParams } from "react-router-dom";
import { useAuthContext } from "@/auth/context";
import { useCircuitStandingsOrchestration } from "@/orchestration/circuitStandings";
import { CircuitStandingsScreen } from "@/features/circuitLeagues/screens/CircuitStandingsScreen";

function positiveInt(raw: string | null | undefined): number | null {
  const n = raw ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function CircuitStandingsPage() {
  const { fullSeasonId: circuitLeagueId } = useParams();
  const [search, setSearch] = useSearchParams();
  const { user } = useAuthContext();
  const o = useCircuitStandingsOrchestration({
    circuitLeagueId: Number(circuitLeagueId)
  });
  // The final results view is kept in the URL (`?results=rosters`).
  const resultsMode = search.get("results") === "rosters" ? "rosters" : "contenders";
  return (
    <CircuitStandingsScreen
      view={o.view}
      viewerUserId={positiveInt(user?.sub)}
      resultsMode={resultsMode}
      onResultsModeChange={(next) =>
        setSearch(
          (prev) => {
            const params = new URLSearchParams(prev);
            if (next === "rosters") params.set("results", "rosters");
            else params.delete("results");
            return params;
          },
          { replace: true }
        )
      }
    />
  );
}
