import { AppError } from "../../errors.js";
import { query, type DbClient } from "../../data/db.js";

export function ensureCommissioner(member: { role: string } | null) {
  if (!member || (member.role !== "OWNER" && member.role !== "CO_OWNER")) {
    throw new AppError("FORBIDDEN", 403, "Commissioner permission required");
  }
}

export function sanitizeInvite(invite: {
  id: number;
  season_id: number;
  status: string;
  label: string | null;
  created_at: Date;
  updated_at: Date;
  claimed_at: Date | null;
  kind: string;
}) {
  return {
    id: invite.id,
    season_id: invite.season_id,
    kind: invite.kind,
    status: invite.status,
    label: invite.label,
    created_at: invite.created_at,
    updated_at: invite.updated_at,
    claimed_at: invite.claimed_at
  };
}

export async function getUserById(client: DbClient, userId: number) {
  const { rows } = await query<{ id: number }>(
    client,
    `SELECT id::int FROM app_user WHERE id = $1`,
    [userId]
  );
  return rows[0] ?? null;
}

export async function getUserByUsername(client: DbClient, username: string) {
  const u = String(username ?? "")
    .trim()
    .toLowerCase();
  if (!u) return null;
  const { rows } = await query<{ id: number; username: string }>(
    client,
    `SELECT id::int, username FROM app_user WHERE lower(username) = $1`,
    [u]
  );
  return rows[0] ?? null;
}

