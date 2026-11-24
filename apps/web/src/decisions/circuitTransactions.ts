import type {
  CircuitLeagueCategory,
  CircuitLeagueMember,
  CircuitTransaction
} from "../lib/types";
import { circuitInstantLabel, circuitTransactionKindLabel } from "./circuitRoster";
import { contenderPillView, type ContenderPillView } from "./contenderPill";

/*
 * The transaction log as rows (pure): who (with their avatar), what moved
 * (the added and dropped contenders as pills) and the kind and time.
 */

export type CircuitTransactionRow = {
  key: number;
  username: string;
  avatarKey: string | null;
  /** "Free agent", "Waiver claim". */
  kindLabel: string;
  occurredAt: string;
  timeLabel: string;
  /** The full date and time, for the `time` element's title. */
  timeTitle: string;
  add: ContenderPillView | null;
  drop: ContenderPillView | null;
};

function fullInstantLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "long"
  }).format(date);
}

export function circuitTransactionRows(
  transactions: readonly CircuitTransaction[],
  categories: readonly Pick<
    CircuitLeagueCategory,
    "id" | "name" | "kind" | "icon_code" | "icon_variant"
  >[],
  members: readonly Pick<CircuitLeagueMember, "user_id" | "avatar_key">[]
): CircuitTransactionRow[] {
  const avatars = new Map(members.map((m) => [m.user_id, m.avatar_key]));
  return transactions.map((t) => ({
    key: t.id,
    username: t.member.username,
    avatarKey: avatars.get(t.member.user_id) ?? null,
    kindLabel: circuitTransactionKindLabel(t.kind),
    occurredAt: t.occurred_at,
    timeLabel: circuitInstantLabel(t.occurred_at),
    timeTitle: fullInstantLabel(t.occurred_at),
    add: t.add ? contenderPillView(t.add, categories) : null,
    drop: t.drop ? contenderPillView(t.drop, categories) : null
  }));
}
