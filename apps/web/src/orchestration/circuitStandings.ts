import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  CircuitCeremonyBreakdown,
  CircuitLeagueDetail,
  CircuitStandings
} from "../lib/types";
import { circuitStandingsVisible } from "../decisions/circuitStandings";
import { errorCode, errorMessage, errorRequestId } from "./query/errors";
import {
  circuitCeremonyBreakdownQuery,
  circuitLeagueQuery,
  circuitStandingsQuery
} from "./query/queries";
import { useCircuitScoreSocket } from "./useCircuitScoreSocket";

/*
 * Standings of a league's season and one ceremony's points per member. Both
 * read the scoring ledger; members hear `score:update` on the league's room
 * and refetch.
 */

type LoadError = {
  state: "error";
  message: string;
  requestId?: string;
  notFound: boolean;
};

export type CircuitStandingsView =
  | { state: "loading" }
  | LoadError
  /** Before the draft finishes there is nothing to rank. */
  | { state: "not-started"; detail: CircuitLeagueDetail }
  | { state: "ready"; detail: CircuitLeagueDetail; standings: CircuitStandings };

export type CircuitCeremonyBreakdownView =
  | { state: "loading" }
  | LoadError
  | { state: "ready"; detail: CircuitLeagueDetail; breakdown: CircuitCeremonyBreakdown };

function loadError(err: unknown, fallback: string): LoadError {
  const code = errorCode(err);
  return {
    state: "error",
    message: errorMessage(err, fallback),
    requestId: errorRequestId(err),
    notFound: code === "NOT_FOUND" || code === "LEAGUE_NOT_FOUND"
  };
}

const validId = (id: number) => Number.isInteger(id) && id > 0;

/** The league detail, and the live socket for members once points can accrue. */
function useStandingsLeague(circuitLeagueId: number) {
  const valid = validId(circuitLeagueId);
  const detailQuery = useQuery({
    ...circuitLeagueQuery(circuitLeagueId),
    enabled: valid
  });
  const detail = detailQuery.data;
  const visible = detail ? circuitStandingsVisible(detail.circuit_league.status) : false;
  useCircuitScoreSocket({
    circuitLeagueId,
    enabled: valid && visible && (detail?.viewer.is_member ?? false)
  });
  return { valid, detailQuery, detail, visible };
}

export function useCircuitStandingsOrchestration(input: { circuitLeagueId: number }) {
  const { circuitLeagueId } = input;
  const { valid, detailQuery, detail, visible } = useStandingsLeague(circuitLeagueId);
  const standingsQuery = useQuery({
    ...circuitStandingsQuery(circuitLeagueId),
    enabled: valid && visible
  });

  const view = useMemo<CircuitStandingsView>(() => {
    if (!valid) return { state: "error", message: "Season not found", notFound: true };
    if (detailQuery.isError) return loadError(detailQuery.error, "Unable to load season");
    if (!detail) return { state: "loading" };
    if (!visible) return { state: "not-started", detail };
    if (standingsQuery.isError) {
      return loadError(standingsQuery.error, "Unable to load standings");
    }
    if (!standingsQuery.data) return { state: "loading" };
    return { state: "ready", detail, standings: standingsQuery.data };
  }, [
    valid,
    detail,
    visible,
    detailQuery.isError,
    detailQuery.error,
    standingsQuery.data,
    standingsQuery.isError,
    standingsQuery.error
  ]);

  return { view };
}

export function useCircuitCeremonyBreakdownOrchestration(input: {
  circuitLeagueId: number;
  ceremonyId: number;
}) {
  const { circuitLeagueId, ceremonyId } = input;
  const league = useStandingsLeague(circuitLeagueId);
  const valid = league.valid && validId(ceremonyId);
  const breakdownQuery = useQuery({
    ...circuitCeremonyBreakdownQuery(circuitLeagueId, ceremonyId),
    enabled: valid
  });
  const { detailQuery, detail } = league;

  const view = useMemo<CircuitCeremonyBreakdownView>(() => {
    if (!valid) return { state: "error", message: "Ceremony not found", notFound: true };
    if (detailQuery.isError) return loadError(detailQuery.error, "Unable to load season");
    if (breakdownQuery.isError) {
      return loadError(breakdownQuery.error, "Unable to load the ceremony's points");
    }
    if (!detail || !breakdownQuery.data) return { state: "loading" };
    return { state: "ready", detail, breakdown: breakdownQuery.data };
  }, [
    valid,
    detail,
    detailQuery.isError,
    detailQuery.error,
    breakdownQuery.data,
    breakdownQuery.isError,
    breakdownQuery.error
  ]);

  return { view };
}
