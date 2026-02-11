import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../../../lib/api";
import type { ApiResult } from "../../../lib/types";
import { notify } from "../../../notifications";
import type { LockState } from "./lock/types";

export function useAdminCeremonyLockOrchestration(args: { ceremonyId: number | null }) {
  const { ceremonyId } = args;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lockState, setLockState] = useState<LockState | null>(null);
  const [status, setStatus] = useState<ApiResult | null>(null);

  const load = useCallback(async () => {
    if (ceremonyId === null || !Number.isFinite(ceremonyId) || ceremonyId <= 0) {
      setLockState(null);
      setLoading(false);
      setStatus({ ok: false, message: "Invalid ceremony id" });
      return;
    }
    setLoading(true);
    setStatus(null);
    const res = await fetchJson<LockState>(`/admin/ceremonies/${ceremonyId}/lock`, {
      method: "GET"
    });
    setLoading(false);
    if (!res.ok) {
      setLockState(null);
      setStatus({ ok: false, message: res.error ?? "Unable to load lock state" });
      return;
    }
    setLockState(res.data ?? null);
  }, [ceremonyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const lock = useCallback(async () => {
    if (ceremonyId === null || !Number.isFinite(ceremonyId) || ceremonyId <= 0) return;
    setSaving(true);
    setStatus(null);
    const res = await fetchJson<{
      draft_locked_at: string | null;
      cancelled_count?: number;
    }>(`/admin/ceremonies/${ceremonyId}/lock`, { method: "POST" });
    setSaving(false);
    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Lock failed" });
      return;
    }
    notify({
      id: "admin.ceremony.lock.success",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "Ceremony locked"
    });
    setStatus(null);
    await load();
  }, [ceremonyId, load]);

  const archive = useCallback(async () => {
    if (ceremonyId === null || !Number.isFinite(ceremonyId) || ceremonyId <= 0) return;
    setSaving(true);
    setStatus(null);
    const res = await fetchJson(`/admin/ceremonies/${ceremonyId}/archive`, {
      method: "POST"
    });
    setSaving(false);
    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Archive failed" });
      return;
    }
    notify({
      id: "admin.ceremony.archive.success",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "Ceremony archived"
    });
    setStatus(null);
    await load();
  }, [ceremonyId, load]);

  return { loading, saving, lockState, status, actions: { lock, archive } };
}

