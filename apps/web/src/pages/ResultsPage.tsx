import { useResultsOrchestration } from "../orchestration/results";
import { ResultsScreen } from "../screens/results/ResultsScreen";

export function ResultsPage() {
  const r = useResultsOrchestration({ initialDraftId: "1" });
  return (
    <ResultsScreen
      draftId={r.draftId}
      onDraftIdChange={r.setDraftId}
      state={r.state}
      error={r.error}
      winners={r.winners}
      snapshot={r.snapshot}
      standings={r.standings}
      picksWithResult={r.picksWithResult}
    />
  );
}
