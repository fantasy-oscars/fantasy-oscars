import { useNavigate } from "react-router-dom";
import { useLeagueCreateOrchestration } from "@/orchestration/leagues";
import { LeagueCreateScreen } from "@/features/leagues/screens/LeagueCreateScreen";

export function LeagueCreatePage() {
  const { creating, error, create } = useLeagueCreateOrchestration();
  const navigate = useNavigate();

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const payload = {
      name: String(data.get("name") ?? "").trim()
    };
    const res = await create(payload);
    if (res.ok && res.league?.id) {
      navigate(`/leagues/${res.league.id}`);
    }
  }

  return <LeagueCreateScreen creating={creating} error={error} onCreate={onCreate} />;
}
