import { useNavigate, useParams } from "react-router-dom";
import { useAuthContext } from "../auth/context";
import { useSeasonOrchestration } from "../orchestration/seasons";
import { SeasonScreen } from "../screens/seasons/SeasonScreen";

export function SeasonPage() {
  const { id } = useParams();
  const seasonId = Number(id);
  const { user } = useAuthContext();
  const navigate = useNavigate();

  const s = useSeasonOrchestration(seasonId, user?.sub);

  return (
    <SeasonScreen
      seasonIdLabel={String(id ?? "")}
      leagueIdForBackLink={s.leagueContext?.league?.id ?? null}
      view={s}
      onDeleteSeason={async () => {
        await s.cancelSeason();
        if (s.leagueContext?.league?.id) {
          navigate(`/leagues/${s.leagueContext.league.id}`, { replace: true });
        } else {
          navigate("/seasons", { replace: true });
        }
      }}
    />
  );
}
