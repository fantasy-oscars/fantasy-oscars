import type { DbClient } from "../../data/db.js";
import {
  listCircuitLeagueEvents,
  listCircuitLeagueMembers,
  type CircuitLeagueMemberRow
} from "../../data/repositories/circuitLeagueRepository.js";
import {
  listCircuitCeremonies,
  type CircuitCeremonyRow
} from "../../data/repositories/circuitRepository.js";
import { listOpenOwnershipsForLeague } from "../../data/repositories/circuitOwnershipRepository.js";
import { listScoreEntries } from "../../data/repositories/circuitScoreRepository.js";
import { listCircuitSelectionsByIds } from "../../data/repositories/circuitSelectionRepository.js";
import { listScoringOccasions, resultsDateOf } from "../../domain/circuit.js";
import { ceremonyOrderOf, scoringContenders } from "../../domain/circuitPoints.js";
import { rankStandings, roundPoints } from "../../domain/circuitScoring.js";
import { AppError } from "../../errors.js";
import { requireVisibleCircuitLeague, type Viewer } from "./circuitLeagues.js";
import { toPublicCircuitSelection } from "./circuitSelections.js";

/*
 * Standings read the scoring ledger (circuit_score_entry) and nothing else:
 * a member's total is the sum of their ledger rows, so the standings always
 * equal the ledger. The per-ceremony breakdown lists the rows behind each
 * member's points for one ceremony; the contenders read lists every
 * selection that scored, with its points per member and ceremony.
 */

const publicMember = (m: CircuitLeagueMemberRow) => ({
  user_id: m.user_id,
  username: m.username,
  avatar_key: m.avatar_key
});

const publicCeremony = (c: CircuitCeremonyRow) => ({
  id: c.ceremony_id,
  code: c.ceremony_code,
  name: c.ceremony_name,
  event: { id: c.circuit_event_id, name: c.event_name },
  nominations_on: c.nominations_on,
  results_on: resultsDateOf(c.starts_at)
});

/** Ceremonies in scoring order: by their first occasion's date, undated last. */
function inScoringOrder(ceremonies: CircuitCeremonyRow[]): CircuitCeremonyRow[] {
  const byId = new Map(ceremonies.map((c) => [c.ceremony_id, c]));
  const ids = [...new Set(listScoringOccasions(ceremonies).map((o) => o.ceremony_id))];
  return ids.map((id) => byId.get(id)!);
}

/**
 * The league's cumulative standings, and the ceremonies of its enabled
 * events with the points each has awarded so far.
 */
export async function getCircuitStandings(
  client: DbClient,
  circuitLeagueId: number,
  viewer: Viewer
) {
  const { circuitLeague } = await requireVisibleCircuitLeague(
    client,
    circuitLeagueId,
    viewer
  );
  const members = await listCircuitLeagueMembers(client, circuitLeague.id);
  const entries = await listScoreEntries(client, circuitLeague.id);
  const enabled = new Set(
    (await listCircuitLeagueEvents(client, circuitLeague.id)).map(
      (e) => e.circuit_event_id
    )
  );
  const ceremonies = (
    await listCircuitCeremonies(client, circuitLeague.circuit_id, { publicOnly: true })
  ).filter((c) => enabled.has(c.circuit_event_id));

  const awarded = new Map<number, number>();
  for (const e of entries) {
    awarded.set(e.ceremony_id, roundPoints((awarded.get(e.ceremony_id) ?? 0) + e.points));
  }
  return {
    standings: rankStandings(members, entries).map(({ member, ...row }) => ({
      ...row,
      member: publicMember(member)
    })),
    ceremonies: inScoringOrder(ceremonies).map((c) => ({
      ...publicCeremony(c),
      points_awarded: awarded.get(c.ceremony_id) ?? 0
    }))
  };
}

/** One ceremony's ledger rows per member, ranked by the ceremony's points. */
export async function getCircuitCeremonyBreakdown(
  client: DbClient,
  circuitLeagueId: number,
  ceremonyId: number,
  viewer: Viewer
) {
  const { circuitLeague } = await requireVisibleCircuitLeague(
    client,
    circuitLeagueId,
    viewer
  );
  const ceremony = (
    await listCircuitCeremonies(client, circuitLeague.circuit_id, { publicOnly: true })
  ).find((c) => c.ceremony_id === ceremonyId);
  if (!ceremony) throw new AppError("NOT_FOUND", 404, "Ceremony not found");

  const members = await listCircuitLeagueMembers(client, circuitLeague.id);
  const entries = await listScoreEntries(client, circuitLeague.id, ceremonyId);
  const held = new Set(
    (await listOpenOwnershipsForLeague(client, circuitLeague.id)).map(
      (o) => `${o.member_id}:${o.selection_id}`
    )
  );
  const selections = new Map(
    (
      await listCircuitSelectionsByIds(client, [
        ...new Set(entries.map((e) => e.selection_id))
      ])
    ).map((s) => [s.id, toPublicCircuitSelection(s)])
  );
  return {
    ceremony: publicCeremony(ceremony),
    standings: rankStandings(members, entries).map(({ member, ...row }) => ({
      ...row,
      member: publicMember(member),
      entries: entries
        .filter((e) => e.member_id === member.id && selections.has(e.selection_id))
        .map((e) => ({
          selection: selections.get(e.selection_id)!,
          kind: e.kind,
          occasion_date: e.occasion_date,
          points: e.points,
          owned_now: held.has(`${e.member_id}:${e.selection_id}`)
        }))
    }))
  };
}

/**
 * Every selection that scored in the league: its season total, the members
 * it scored for and one line per ceremony and member. The totals add up to
 * the sum of the standings.
 */
export async function getCircuitScoringContenders(
  client: DbClient,
  circuitLeagueId: number,
  viewer: Viewer
) {
  const { circuitLeague } = await requireVisibleCircuitLeague(
    client,
    circuitLeagueId,
    viewer
  );
  const [members, entries, ceremonies] = await Promise.all([
    listCircuitLeagueMembers(client, circuitLeague.id),
    listScoreEntries(client, circuitLeague.id),
    listCircuitCeremonies(client, circuitLeague.circuit_id)
  ]);
  const memberById = new Map(members.map((m) => [m.id, m]));
  const names = new Map(ceremonies.map((c) => [c.ceremony_id, c.ceremony_name]));
  const contenders = scoringContenders(entries, ceremonyOrderOf(ceremonies));
  const selections = new Map(
    (
      await listCircuitSelectionsByIds(
        client,
        contenders.map((c) => c.selection_id)
      )
    ).map((s) => [s.id, toPublicCircuitSelection(s)])
  );
  return {
    contenders: contenders
      .filter((c) => selections.has(c.selection_id))
      .map((c) => ({
        selection: selections.get(c.selection_id)!,
        total: c.total,
        members: c.members.map((m) => ({
          ...publicMember(memberById.get(m.member_id)!),
          points: m.points
        })),
        lines: c.lines.map((l) => ({
          ceremony_id: l.ceremony_id,
          ceremony_name: names.get(l.ceremony_id) ?? null,
          user_id: memberById.get(l.member_id)!.user_id,
          nomination: l.nomination,
          win: l.win
        }))
      }))
  };
}
