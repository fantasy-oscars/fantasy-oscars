import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import {
  LEGACY_FULL_SEASON_ROUTE,
  LegacyFullSeasonRedirect
} from "@/app/pages/LegacyFullSeasonRedirect";
import {
  circuitLeaguePath,
  circuitRosterPath,
  circuitTransactionsPath
} from "@/lib/routes";

afterEach(cleanup);

function Where() {
  const location = useLocation();
  return (
    <div role="status">{`${location.pathname}${location.search}${location.hash}`}</div>
  );
}

function landAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={LEGACY_FULL_SEASON_ROUTE} element={<LegacyFullSeasonRedirect />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
  const where = screen.getByRole("status").textContent;
  cleanup();
  return where;
}

describe("full season URLs", () => {
  const link = { leagueId: 3, leagueName: "Film Club", circuitLeagueId: 4 };

  it("sit under the league's seasons", () => {
    expect(circuitLeaguePath(link)).toBe("/leagues/3/film-club/seasons/full/4");
    expect(circuitRosterPath(link)).toBe("/leagues/3/film-club/seasons/full/4/roster");
    expect(circuitRosterPath({ ...link, memberUserId: 9 })).toBe(
      "/leagues/3/film-club/seasons/full/4/roster?member=9"
    );
    expect(circuitTransactionsPath(link)).toBe(
      "/leagues/3/film-club/seasons/full/4/transactions"
    );
  });

  it("redirect from the old paths, keeping the sub-page, query and hash", () => {
    expect(landAt("/leagues/3/film-club/circuits/4")).toBe(
      "/leagues/3/film-club/seasons/full/4"
    );
    expect(landAt("/leagues/3/film-club/circuits/4/roster?member=9")).toBe(
      "/leagues/3/film-club/seasons/full/4/roster?member=9"
    );
    expect(landAt("/leagues/3/film-club/circuits/4/transactions#latest")).toBe(
      "/leagues/3/film-club/seasons/full/4/transactions#latest"
    );
  });
});
