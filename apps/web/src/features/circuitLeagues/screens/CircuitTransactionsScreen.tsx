import { Link } from "react-router-dom";
import { Button } from "@ui";
import type { CircuitTransactionsView } from "@/orchestration/circuitRoster";
import { circuitLeaguePath, circuitRosterPath } from "@/lib/routes";
import {
  CircuitPageError,
  CircuitPageFrame,
  CircuitPageSkeleton
} from "@/features/circuitLeagues/ui/CircuitPageFrame";
import { CircuitTransactionList } from "@/features/circuitLeagues/ui/CircuitTransactionList";

export function CircuitTransactionsScreen(props: { view: CircuitTransactionsView }) {
  const { view } = props;
  if (view.state === "loading")
    return <CircuitPageSkeleton label="Loading transactions" />;
  if (view.state === "error") {
    return (
      <CircuitPageError
        title="Transactions"
        notFound={view.notFound}
        message={view.message}
        requestId={view.requestId}
      />
    );
  }
  const { detail, transactions } = view;
  const link = {
    leagueId: detail.league.id,
    leagueName: detail.league.name,
    circuitLeagueId: detail.circuit_league.id
  };
  return (
    <CircuitPageFrame
      title="Transactions"
      subtitle={`${detail.circuit?.name ?? "Season"} · ${detail.league.name}`}
      actions={
        <>
          <Button component={Link} to={circuitRosterPath(link)} variant="outline">
            Rosters
          </Button>
          <Button component={Link} to={circuitLeaguePath(link)} variant="outline">
            Back to season
          </Button>
        </>
      }
    >
      <CircuitTransactionList transactions={transactions} />
    </CircuitPageFrame>
  );
}
