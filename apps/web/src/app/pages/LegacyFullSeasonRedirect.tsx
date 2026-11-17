import { Navigate, useLocation, useParams } from "react-router-dom";

/*
 * Full awards seasons used to live under `/circuits/`. Old links (bookmarks,
 * shared URLs) land here and move to the season URL, keeping the sub-page
 * (roster, transactions), the query string and the hash.
 */
export const LEGACY_FULL_SEASON_ROUTE =
  "/leagues/:leagueId/:leagueSlug/circuits/:fullSeasonId/*";

export function legacyFullSeasonTarget(input: {
  leagueId: string;
  leagueSlug: string;
  fullSeasonId: string;
  rest: string;
  search: string;
  hash: string;
}): string {
  const rest = input.rest.replace(/^\/+|\/+$/g, "");
  return `/leagues/${input.leagueId}/${input.leagueSlug}/seasons/full/${input.fullSeasonId}${
    rest ? `/${rest}` : ""
  }${input.search}${input.hash}`;
}

export function LegacyFullSeasonRedirect() {
  const params = useParams();
  const location = useLocation();
  return (
    <Navigate
      replace
      to={legacyFullSeasonTarget({
        leagueId: params.leagueId ?? "",
        leagueSlug: params.leagueSlug ?? "",
        fullSeasonId: params.fullSeasonId ?? "",
        rest: params["*"] ?? "",
        search: location.search,
        hash: location.hash
      })}
    />
  );
}
