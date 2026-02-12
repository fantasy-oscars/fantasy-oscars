import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../../lib/api";
import type { Snapshot } from "../../lib/types";
import { buildPicksWithResult, computeStandings } from "../../decisions/results";

export type ResultsWinner = { category_edition_id: number; nomination_id: number };
export type ResultsViewState = "loading" | "unavailable" | "error" | "ready";

export function useResultsOrchestration(input?: { initialDraftId?: string }) {
  const [draftId, setDraftId] = useState(input?.initialDraftId ?? "1");
  const [state, setState] = useState<ResultsViewState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [winners, setWinners] = useState<ResultsWinner[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const winnerNominationIds = useMemo(
    () => new Set(winners.map((w) => w.nomination_id)),
    [winners]
  );

  const standings = useMemo(() => {
    if (!snapshot) return [];
    return computeStandings(snapshot, winnerNominationIds);
  }, [snapshot, winnerNominationIds]);

  const picksWithResult = useMemo(() => {
    if (!snapshot) return [];
    return buildPicksWithResult(snapshot, winnerNominationIds);
  }, [snapshot, winnerNominationIds]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Global refresh policy: if we already have something rendered, refresh in-place.
      const hasContent =
        snapshot !== null || state === "ready" || state === "unavailable";
      if (!hasContent) setState("loading");
      setError(null);

      const winnersRes = await fetchJson<{ winners: ResultsWinner[] }>(
        "/ceremony/active/winners",
        { method: "GET" }
      );
      if (!winnersRes.ok) {
        if (!cancelled) {
          setError(winnersRes.error ?? "Failed to load winners");
          if (!hasContent) setState("error");
        }
        return;
      }

      const snapshotRes = await fetchJson<Snapshot>(`/drafts/${draftId}/snapshot`, {
        method: "GET"
      });
      if (!snapshotRes.ok) {
        if (!cancelled) {
          setError(snapshotRes.error ?? "Failed to load draft results");
          if (!hasContent) setState("error");
        }
        return;
      }

      if (cancelled) return;

      setWinners(winnersRes.data?.winners ?? []);
      setSnapshot(snapshotRes.data ?? null);

      if (!winnersRes.data?.winners?.length) {
        setState("unavailable");
        return;
      }
      setState("ready");
    }

    if (String(draftId).trim().length === 0) {
      setError("Enter a draft id.");
      setState("error");
      return;
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [draftId, reloadKey]);

  return {
    draftId,
    setDraftId,
    state,
    error,
    winners,
    snapshot,
    standings,
    picksWithResult,
    refresh
  };
}
