import { useQuery } from "@tanstack/react-query";
import { ceremonyCodeSlug } from "../../lib/routes";
import { errorMessage, errorRequestId } from "../query/errors";
import { leagueSeasonsQuery } from "../query/queries";

/**
 * Resolves a season route (legacy `/seasons/:id`, or `/leagues/:leagueId/:slug/:ceremonyCode`)
 * to a season id. League seasons come from the shared cached query.
 */
export function useSeasonRouteOrchestration(input: {
  seasonIdFromLegacy: number | null;
  leagueId: number | null;
  ceremonyCode?: string;
}) {
  const { seasonIdFromLegacy, leagueId, ceremonyCode } = input;
  const needsLookup = !seasonIdFromLegacy && Boolean(leagueId && ceremonyCode);

  const query = useQuery({
    ...leagueSeasonsQuery(leagueId ?? 0),
    enabled: needsLookup
  });

  if (seasonIdFromLegacy) {
    return {
      resolvedSeasonId: seasonIdFromLegacy,
      resolving: false,
      resolveError: null,
      resolveRequestId: undefined
    };
  }
  if (!needsLookup) {
    return {
      resolvedSeasonId: null,
      resolving: false,
      resolveError: "Invalid season route",
      resolveRequestId: undefined
    };
  }
  if (query.isError && !query.data) {
    return {
      resolvedSeasonId: null,
      resolving: false,
      resolveError: errorMessage(query.error, "Could not load season"),
      resolveRequestId: errorRequestId(query.error)
    };
  }
  if (!query.data) {
    return {
      resolvedSeasonId: null,
      resolving: true,
      resolveError: null,
      resolveRequestId: undefined
    };
  }

  const slug = ceremonyCodeSlug(ceremonyCode);
  const matches = query.data.filter(
    (s) => ceremonyCodeSlug(s.ceremony_code ?? String(s.ceremony_id)) === slug
  );
  if (matches.length === 0) {
    return {
      resolvedSeasonId: null,
      resolving: false,
      resolveError: "Season not found",
      resolveRequestId: undefined
    };
  }
  const extant = matches.find((s) => s.status === "EXTANT");
  const chosen =
    extant ??
    [...matches].sort(
      (a, b) => Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? "")
    )[0];
  return {
    resolvedSeasonId: chosen?.id ?? null,
    resolving: false,
    resolveError: null,
    resolveRequestId: undefined
  };
}
