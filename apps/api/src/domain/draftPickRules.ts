export function resolvePicksPerSeat(
  draft: { picks_per_seat: number | null },
  league: { roster_size: number | string | null }
) {
  const rosterSizeRaw = Number(league?.roster_size);
  const fallback =
    Number.isFinite(rosterSizeRaw) && rosterSizeRaw > 0 ? rosterSizeRaw : 1;
  if (draft.picks_per_seat === null || draft.picks_per_seat === undefined)
    return fallback;
  return draft.picks_per_seat > 0 ? draft.picks_per_seat : fallback;
}

export function resolveTotalRequiredPicks(
  draft: { total_picks?: number | null },
  seatCount: number,
  picksPerSeat: number
) {
  if (draft.total_picks !== null && draft.total_picks !== undefined) {
    return draft.total_picks;
  }
  return seatCount * picksPerSeat;
}

export function computeDeadline(
  now: Date,
  pickTimerSeconds: number | null | undefined,
  overrideMs?: number | null
): Date | null {
  if (pickTimerSeconds === null || pickTimerSeconds === undefined) return null;
  const ms = overrideMs ?? pickTimerSeconds * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return new Date(now.getTime() + ms);
}

