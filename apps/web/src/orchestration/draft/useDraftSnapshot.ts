import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "../../lib/api";
import type { Snapshot } from "../../lib/types";
import { estimateServerOffsetMs } from "../../decisions/draft/clockSkew";

export function useDraftSnapshot(args: { draftId: string; disabled?: boolean }) {
  const { draftId, disabled } = args;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  // Server clock minus local clock, in ms. Zero until the server has stamped something.
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const serverOffsetRef = useRef(0);

  const recordServerTime = useCallback(
    (args: { serverTime: string | null | undefined; sentAtMs?: number }) => {
      const offset = estimateServerOffsetMs({
        serverTime: args.serverTime,
        receivedAtMs: Date.now(),
        sentAtMs: args.sentAtMs
      });
      if (offset === null) return;
      serverOffsetRef.current = offset;
      setServerOffsetMs(offset);
    },
    []
  );

  const snapshotRef = useRef<Snapshot | null>(null);
  const lastVersionRef = useRef<number | null>(null);
  const lastStatusRef = useRef<string | null>(null);

  useEffect(() => {
    snapshotRef.current = snapshot;
    lastVersionRef.current = snapshot?.version ?? null;
    lastStatusRef.current = snapshot?.draft.status ?? null;
  }, [snapshot]);

  const loadSnapshot = useCallback(
    async (options?: { preserveSnapshot?: boolean }) => {
      setLoading(true);
      setError(null);
      // Avoid UI "flashes" during in-place refreshes (e.g. after submitting a pick).
      // We only clear the snapshot when explicitly requested (or when there isn't one yet).
      const shouldClear = !options?.preserveSnapshot && !snapshotRef.current;
      if (shouldClear) setSnapshot(null);

      const sentAtMs = Date.now();
      const res = await fetchJson<Snapshot>(`/drafts/${draftId}/snapshot`, {
        method: "GET"
      });
      if (res.ok && res.data) {
        recordServerTime({ serverTime: res.data.server_time, sentAtMs });
        setSnapshot(res.data);
        setLoading(false);
        return true;
      }
      setError(res.error ?? "Failed to load draft snapshot");
      setLoading(false);
      return false;
    },
    [draftId, recordServerTime]
  );

  const refresh = useCallback(() => {
    void loadSnapshot({ preserveSnapshot: true });
  }, [loadSnapshot]);

  useEffect(() => {
    if (disabled) return;
    if (!snapshot && !loading) void loadSnapshot();
  }, [disabled, loadSnapshot, loading, snapshot]);

  return {
    loading,
    error,
    snapshot,
    serverOffsetMs,
    serverOffsetRef,
    recordServerTime,
    setSnapshot,
    snapshotRef,
    lastVersionRef,
    lastStatusRef,
    loadSnapshot,
    refresh,
    setError
  };
}
