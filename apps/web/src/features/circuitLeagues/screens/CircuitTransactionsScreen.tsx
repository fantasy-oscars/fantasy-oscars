import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@ui";
import { useMediaQuery } from "@ui/hooks";
import { circuitTransactionRows } from "@/decisions/circuitTransactions";
import type { ContenderPillView } from "@/decisions/contenderPill";
import { FO_BP_MOBILE_MAX_PX } from "@/tokens/breakpoints";
import type { CircuitTransactionsView } from "@/orchestration/circuitRoster";
import { circuitLeaguePath, circuitRosterPath } from "@/lib/routes";
import {
  CircuitPageError,
  CircuitPageFrame,
  CircuitPageSkeleton
} from "@/features/circuitLeagues/ui/CircuitPageFrame";
import { CircuitTransactionList } from "@/features/circuitLeagues/ui/CircuitTransactionList";
import { ContenderCardModal } from "@/features/circuitLeagues/ui/ContenderCardModal";

export function CircuitTransactionsScreen(props: { view: CircuitTransactionsView }) {
  const { view } = props;
  const isMobile = useMediaQuery(`(max-width: ${FO_BP_MOBILE_MAX_PX}px)`);
  const coarse = useMediaQuery("(pointer: coarse)");
  const [card, setCard] = useState<ContenderPillView | null>(null);
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
      <CircuitTransactionList
        rows={circuitTransactionRows(transactions, detail.categories, detail.members)}
        onOpenCard={isMobile || coarse ? setCard : undefined}
      />
      <ContenderCardModal
        card={card ? { tooltip: card.tooltip, actions: [] } : null}
        onClose={() => setCard(null)}
      />
    </CircuitPageFrame>
  );
}
