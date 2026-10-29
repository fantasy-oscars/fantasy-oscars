import type { Snapshot } from "../../lib/types";
import {
  buildPicksBySeat,
  computeRoundPickLabel,
  computeSeatNumberForPickNumber,
  type DraftTurn
} from "../draft";

export type LedgerRow = {
  pickNumber: number;
  roundPick: string;
  seatNumber: number | null;
  seatLabel: string;
  nominationId: number | null;
  icon: string | null;
  label: string;
  active: boolean;
  winner: boolean;
};

export type MyPick = {
  pickNumber: number;
  roundPick: string;
  nominationId: number;
  icon: string | null;
  label: string;
  winner: boolean;
};

export type RosterRow = {
  pickNumber: number;
  nominationId: number;
  icon: string | null;
  label: string;
  winner: boolean;
};

export type CursorSpyCursor = {
  userId: number;
  seatNumber: number | null;
  label: string;
  avatarKey: string | null;
  x: number;
  y: number;
};

export function buildLedgerRows(args: {
  snapshot: Snapshot | null;
  picksByNumber: Map<number, Snapshot["picks"][number]> | null;
  turn: DraftTurn | null;
  nominationLabelById: Map<number, string>;
  nominationIconById: Map<number, string>;
  winnerSet: Set<number>;
}): LedgerRow[] {
  const {
    snapshot,
    picksByNumber,
    turn,
    nominationLabelById,
    nominationIconById,
    winnerSet
  } = args;
  if (!snapshot || !picksByNumber) return [];
  const total = snapshot.total_picks ?? 0;
  const activePick =
    turn?.current_pick_number ?? snapshot.draft.current_pick_number ?? null;
  const seatCount = snapshot.seats.length;
  const seatLabelByNumber = new Map(
    snapshot.seats.map((s) => [s.seat_number, s.username ?? `Seat ${s.seat_number}`])
  );
  const rows: LedgerRow[] = [];

  for (let idx = 0; idx < total; idx++) {
    const pickNumber = idx + 1;
    const pick = picksByNumber.get(pickNumber) ?? null;
    const seatNumber =
      pick?.seat_number ??
      computeSeatNumberForPickNumber({ pickNumber, seatCount }) ??
      null;
    const seatLabel = seatNumber ? (seatLabelByNumber.get(seatNumber) ?? "—") : "—";
    const label = pick
      ? (nominationLabelById.get(pick.nomination_id) ?? "Unnamed nomination")
      : "—";
    const icon = pick ? (nominationIconById.get(pick.nomination_id) ?? null) : null;
    rows.push({
      pickNumber,
      roundPick: computeRoundPickLabel({ pickNumber, seatCount }),
      seatNumber,
      seatLabel,
      nominationId: pick?.nomination_id ?? null,
      icon,
      label,
      active: activePick === pickNumber,
      winner: Boolean(pick?.nomination_id && winnerSet.has(pick.nomination_id))
    });
  }
  return rows;
}

export function buildMyPicks(args: {
  snapshot: Snapshot | null;
  mySeatNumber: number | null;
  nominationLabelById: Map<number, string>;
  nominationIconById: Map<number, string>;
  winnerSet: Set<number>;
}): MyPick[] {
  const { snapshot, mySeatNumber, nominationLabelById, nominationIconById, winnerSet } =
    args;
  if (!snapshot || !mySeatNumber) return [];
  const seatCount = snapshot.seats.length;
  return snapshot.picks
    .filter((p) => p.seat_number === mySeatNumber)
    .sort((a, b) => a.pick_number - b.pick_number)
    .map((p) => ({
      pickNumber: p.pick_number,
      roundPick: computeRoundPickLabel({ pickNumber: p.pick_number, seatCount }),
      nominationId: p.nomination_id,
      icon: nominationIconById.get(p.nomination_id) ?? null,
      label: nominationLabelById.get(p.nomination_id) ?? "Unnamed nomination",
      winner: winnerSet.has(p.nomination_id)
    }));
}

export function buildRosterRowsBySeat(args: {
  snapshot: Snapshot | null;
  nominationLabelById: Map<number, string>;
  nominationIconById: Map<number, string>;
  winnerSet: Set<number>;
}): Map<number, RosterRow[]> {
  const { snapshot, nominationLabelById, nominationIconById, winnerSet } = args;
  const out = new Map<number, RosterRow[]>();
  if (!snapshot) return out;
  const picksBySeat = buildPicksBySeat(snapshot);
  for (const seat of snapshot.seats) {
    out.set(
      seat.seat_number,
      (picksBySeat.get(seat.seat_number) ?? []).map((p) => ({
        pickNumber: p.pick_number,
        nominationId: p.nomination_id,
        icon: nominationIconById.get(p.nomination_id) ?? null,
        label: nominationLabelById.get(p.nomination_id) ?? "Unnamed nomination",
        winner: winnerSet.has(p.nomination_id)
      }))
    );
  }
  return out;
}

export function buildCursorSpyCursors(args: {
  snapshot: Snapshot | null;
  enabled: boolean;
  remoteCursorByUserId: Record<number, { x: number; y: number; ts: number }>;
}): CursorSpyCursor[] {
  const { snapshot, enabled, remoteCursorByUserId } = args;
  if (!enabled || !snapshot) return [];
  const seatByUserId = new Map<number, NonNullable<Snapshot["seats"]>[number]>();
  for (const seat of snapshot.seats) {
    const uid = Number(seat.user_id);
    if (!Number.isFinite(uid) || uid <= 0) continue;
    seatByUserId.set(uid, seat);
  }

  return Object.entries(remoteCursorByUserId)
    .map(([rawUserId, point]) => {
      const userId = Number(rawUserId);
      if (!Number.isFinite(userId) || userId <= 0) return null;
      const seat = seatByUserId.get(userId);
      return {
        userId,
        seatNumber: seat?.seat_number ?? null,
        label: seat?.username ?? `User ${userId}`,
        avatarKey: seat?.avatar_key ?? null,
        x: point.x,
        y: point.y
      };
    })
    .filter(Boolean) as CursorSpyCursor[];
}
