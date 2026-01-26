import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../../lib/api";
import type { Snapshot } from "../../lib/types";

export type ResultsWinner = { category_edition_id: number; nomination_id: number };
export type ResultsViewState = "loading" | "unavailable" | "error" | "ready";

export function useResults(draftId: string) {
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
    const seatScores: Record<number, { seat: number; points: number }> = {};
    for (const seat of snapshot.seats) {
      seatScores[seat.seat_number] = { seat: seat.seat_number, points: 0 };
    }
    for (const pick of snapshot.picks) {
      if (winnerNominationIds.has(pick.nomination_id)) {
        seatScores[pick.seat_number].points += 1;
      }
    }
    return Object.values(seatScores).sort((a, b) => b.points - a.points);
  }, [snapshot, winnerNominationIds]);

  const picksWithResult = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.picks
      .slice()
      .sort((a, b) => a.pick_number - b.pick_number)
      .map((p) => ({ ...p, isWinner: winnerNominationIds.has(p.nomination_id) }));
  }, [snapshot, winnerNominationIds]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState("loading");
      setError(null);

      const winnersRes = await fetchJson<{ winners: ResultsWinner[] }>(
        "/ceremony/active/winners",
        {
          method: "GET"
        }
      );
      if (!winnersRes.ok) {
        if (!cancelled) {
          setError(winnersRes.error ?? "Failed to load winners");
          setState("error");
        }
        return;
      }

      const snapshotRes = await fetchJson<Snapshot>(`/drafts/${draftId}/snapshot`, {
        method: "GET"
      });
      if (!snapshotRes.ok) {
        if (!cancelled) {
          setError(snapshotRes.error ?? "Failed to load draft results");
          setState("error");
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

  return { state, error, winners, snapshot, standings, picksWithResult, refresh };
}
