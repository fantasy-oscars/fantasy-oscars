import type { Pool } from "pg";

type AuditInput = {
  actor_user_id: number;
  action: string;
  target_type?: string | null;
  target_id?: number | null;
  meta?: Record<string, unknown> | null;
};

export async function insertAdminAudit(pool: Pool, input: AuditInput) {
  const {
    actor_user_id,
    action,
    target_type = null,
    target_id = null,
    meta = null
  } = input;
  await pool.query(
    `INSERT INTO admin_audit_log (actor_user_id, action, target_type, target_id, meta)
     VALUES ($1, $2, $3, $4, $5)`,
    [actor_user_id, action, target_type, target_id, meta]
  );
}
