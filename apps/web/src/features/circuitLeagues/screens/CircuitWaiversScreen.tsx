import { useState } from "react";
import { Link } from "react-router-dom";
import { Box, Button, Text } from "@ui";
import { useMediaQuery } from "@ui/hooks";
import type {
  CircuitClaimDraft,
  CircuitWaiversView
} from "@/orchestration/circuitWaivers";
import type { CircuitRosterEntry } from "@/decisions/circuitRoster";
import {
  circuitClaimRows,
  circuitPriorityEntries,
  circuitWaiverResultRows,
  circuitPriorityAfter
} from "@/decisions/circuitWaivers";
import type { ContenderPillView } from "@/decisions/contenderPill";
import type { ApiResult, CircuitClaim, CircuitClaims } from "@/lib/types";
import { FO_BP_MOBILE_MAX_PX } from "@/tokens/breakpoints";
import {
  circuitLeaguePath,
  circuitRosterPath,
  circuitTransactionsPath
} from "@/lib/routes";
import {
  CircuitPageError,
  CircuitPageFrame,
  CircuitPageSkeleton
} from "@/features/circuitLeagues/ui/CircuitPageFrame";
import {
  CIRCUIT_CLAIM_HEADING_ID,
  CircuitClaimsSection
} from "@/features/circuitLeagues/ui/CircuitClaimsSection";
import { useHashFocus } from "./useHashFocus";
import { CircuitClaimModal } from "@/features/circuitLeagues/ui/CircuitClaimModal";
import { CircuitPriorityList } from "@/features/circuitLeagues/ui/CircuitPriorityList";
import { CircuitWaiverResults } from "@/features/circuitLeagues/ui/CircuitWaiverResults";
import { ContenderCardModal } from "@/features/circuitLeagues/ui/ContenderCardModal";
import {
  withContenderPreview,
  type CircuitSeasonPicker
} from "@/features/circuitLeagues/ui/ContenderPreviewRow";

export function CircuitWaiversScreen(props: {
  view: CircuitWaiversView;
  viewerUserId: number | null;
  /** The contender picker, once the viewer can claim, with the chosen contender's owner. */
  picker: CircuitSeasonPicker | null;
  phone: boolean;
  draft: CircuitClaimDraft | null;
  dropOptions: CircuitRosterEntry[];
  chipOptions: CircuitClaims["chips"];
  warning: string | null;
  dropError: string | null;
  saving: boolean;
  busy: boolean;
  modalStatus: ApiResult | null;
  listStatus: ApiResult | null;
  onReorder: (claimIds: number[]) => void;
  onEdit: (claim: CircuitClaim) => void;
  onWithdraw: (claim: CircuitClaim) => void;
  onChangeDraft: (patch: {
    dropSelectionId?: number | null;
    noDrop?: boolean;
    chipId?: number | null;
  }) => void;
  onCloseClaim: () => void;
  onSaveClaim: () => void;
}) {
  const { view } = props;
  const isMobile = useMediaQuery(`(max-width: ${FO_BP_MOBILE_MAX_PX}px)`);
  const coarse = useMediaQuery("(pointer: coarse)");
  const [card, setCard] = useState<ContenderPillView | null>(null);
  const openCard = isMobile || coarse ? setCard : undefined;
  useHashFocus(
    "claim",
    CIRCUIT_CLAIM_HEADING_ID,
    view.state === "ready" && view.canClaim && props.picker !== null
  );
  if (view.state === "loading") return <CircuitPageSkeleton label="Loading waivers" />;
  if (view.state === "error") {
    return (
      <CircuitPageError
        title="Waivers"
        notFound={view.notFound}
        message={view.message}
        requestId={view.requestId}
      />
    );
  }

  const { detail, waivers, runs, claims } = view;
  const { categories, members } = detail;
  const link = {
    leagueId: detail.league.id,
    leagueName: detail.league.name,
    circuitLeagueId: detail.circuit_league.id
  };
  return (
    <CircuitPageFrame
      title="Waivers"
      subtitle={`${detail.circuit?.name ?? "Season"} · ${detail.league.name}`}
      actions={
        <>
          <Button component={Link} to={circuitRosterPath(link)} variant="outline">
            {detail.viewer.is_member ? "Your roster" : "Rosters"}
          </Button>
          <Button component={Link} to={circuitTransactionsPath(link)} variant="outline">
            Transactions
          </Button>
          <Button component={Link} to={circuitLeaguePath(link)} variant="outline">
            Back to season
          </Button>
        </>
      }
    >
      <Box className="baseline-grid2Wide">
        {claims ? (
          <CircuitClaimsSection
            claims={claims}
            rows={circuitClaimRows(view.pending, categories)}
            phone={props.phone}
            canClaim={view.canClaim}
            busy={props.busy}
            status={props.listStatus}
            picker={
              props.picker
                ? withContenderPreview({
                    picker: props.picker,
                    categories,
                    viewerUserId: props.viewerUserId,
                    drop: null,
                    busy: props.busy,
                    verb: "Claim"
                  })
                : null
            }
            onReorder={props.onReorder}
            onEdit={props.onEdit}
            onWithdraw={props.onWithdraw}
            onOpenCard={openCard}
          />
        ) : detail.viewer.is_member ? null : (
          <Text className="baseline-textBody">
            You have not joined this season, so you have no claims.
          </Text>
        )}
        <CircuitPriorityList
          entries={circuitPriorityEntries(waivers, members)}
          viewerUserId={props.viewerUserId}
        />
      </Box>
      <CircuitWaiverResults
        runs={runs.map((run) => ({
          run,
          rows: circuitWaiverResultRows(run, categories, members),
          priorityAfter: circuitPriorityAfter(run, members)
        }))}
        onOpenCard={openCard}
      />
      <ContenderCardModal
        card={card ? { tooltip: card.tooltip, actions: [] } : null}
        onClose={() => setCard(null)}
      />
      <CircuitClaimModal
        draft={props.draft}
        categories={categories}
        phone={props.phone}
        dropOptions={props.dropOptions}
        chipOptions={props.chipOptions}
        warning={props.warning}
        dropError={props.dropError}
        saving={props.saving}
        status={props.modalStatus}
        onChange={props.onChangeDraft}
        onClose={props.onCloseClaim}
        onSave={props.onSaveClaim}
      />
    </CircuitPageFrame>
  );
}
