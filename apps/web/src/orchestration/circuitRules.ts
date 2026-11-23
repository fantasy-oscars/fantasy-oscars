import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { circuitRulesFrom, type CircuitRules } from "../decisions/circuitRules";
import type { CircuitLeagueDetail } from "../lib/types";
import { errorCode, errorMessage, errorRequestId } from "./query/errors";
import { circuitLeagueQuery } from "./query/queries";

/*
 * The rules of a league's season, read from the league detail so the page
 * always shows the stored settings.
 */

export type CircuitRulesView =
  | { state: "loading" }
  | { state: "error"; message: string; requestId?: string; notFound: boolean }
  | { state: "ready"; detail: CircuitLeagueDetail; rules: CircuitRules };

export function useCircuitRulesOrchestration(input: { circuitLeagueId: number }) {
  const { circuitLeagueId } = input;
  const valid = Number.isInteger(circuitLeagueId) && circuitLeagueId > 0;
  const query = useQuery({ ...circuitLeagueQuery(circuitLeagueId), enabled: valid });

  const view = useMemo<CircuitRulesView>(() => {
    if (!valid) return { state: "error", message: "Season not found", notFound: true };
    if (query.isError) {
      const code = errorCode(query.error);
      return {
        state: "error",
        message: errorMessage(query.error, "Unable to load season"),
        requestId: errorRequestId(query.error),
        notFound: code === "NOT_FOUND" || code === "LEAGUE_NOT_FOUND"
      };
    }
    if (!query.data) return { state: "loading" };
    return { state: "ready", detail: query.data, rules: circuitRulesFrom(query.data) };
  }, [valid, query.isError, query.error, query.data]);

  return { view };
}
