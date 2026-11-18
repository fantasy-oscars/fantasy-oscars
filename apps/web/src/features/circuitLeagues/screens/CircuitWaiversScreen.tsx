import { Link } from "react-router-dom";
import { Box, Button, Text } from "@ui";
import type { ContenderPickerProps } from "@/features/contenders/ui/ContenderPicker";
import type {
  CircuitClaimDraft,
  CircuitWaiversView
} from "@/orchestration/circuitWaivers";
import type { CircuitRosterEntry } from "@/decisions/circuitRoster";
import { circuitPriorityEntries } from "@/decisions/circuitWaivers";
import type { ApiResult, CircuitClaim, CircuitClaims } from "@/lib/types";
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
import { CircuitClaimsSection } from "@/features/circuitLeagues/ui/CircuitClaimsSection";
import { CircuitClaimModal } from "@/features/circuitLeagues/ui/CircuitClaimModal";
import { CircuitPriorityList } from "@/features/circuitLeagues/ui/CircuitPriorityList";
import { CircuitWaiverResults } from "@/features/circuitLeagues/ui/CircuitWaiverResults";

export function CircuitWaiversScreen(props: {
  view: CircuitWaiversView;
  viewerUserId: number | null;
  /** The contender picker, once the viewer can claim. */
  picker: ContenderPickerProps | null;
  phone: boolean;
  draft: CircuitClaimDraft | null;
  dropOptions: CircuitRosterEntry[];
  chipOptions: CircuitClaims["chips"];
  warning: string | null;
  saving: boolean;
  busy: boolean;
  modalStatus: ApiResult | null;
  listStatus: ApiResult | null;
  onReorder: (claimIds: number[]) => void;
  onEdit: (claim: CircuitClaim) => void;
  onWithdraw: (claim: CircuitClaim) => void;
  onChangeDraft: (patch: {
    dropSelectionId?: number | null;
    chipId?: number | null;
  }) => void;
  onCloseClaim: () => void;
  onSaveClaim: () => void;
}) {
  const { view } = props;
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
            pending={view.pending}
            canClaim={view.canClaim}
            busy={props.busy}
            status={props.listStatus}
            picker={props.picker}
            onReorder={props.onReorder}
            onEdit={props.onEdit}
            onWithdraw={props.onWithdraw}
          />
        ) : detail.viewer.is_member ? null : (
          <Text className="baseline-textBody">
            You have not joined this season, so you have no claims.
          </Text>
        )}
        <CircuitPriorityList
          entries={circuitPriorityEntries(waivers)}
          viewerUserId={props.viewerUserId}
        />
      </Box>
      <CircuitWaiverResults runs={runs} />
      <CircuitClaimModal
        draft={props.draft}
        phone={props.phone}
        dropOptions={props.dropOptions}
        chipOptions={props.chipOptions}
        warning={props.warning}
        saving={props.saving}
        status={props.modalStatus}
        onChange={props.onChangeDraft}
        onClose={props.onCloseClaim}
        onSave={props.onSaveClaim}
      />
    </CircuitPageFrame>
  );
}
