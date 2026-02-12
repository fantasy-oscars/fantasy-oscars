import type { Socket } from "socket.io-client";
import { useEffect, type RefObject } from "react";
import { fetchJson } from "../../lib/api";
import type { Snapshot } from "../../lib/types";

// Keeps the client from getting "stuck" if timer expiry happens and/or if the websocket
// disconnects and misses events (e.g. short timers, flaky networks).
export function useDraftHeartbeat(args: {
  disabled?: boolean;
  draftId: number | null;
  snapshotRef: RefObject<Snapshot | null>;
  socketRef: RefObject<Socket | null>;
  loadSnapshot: (options?: { preserveSnapshot?: boolean }) => Promise<boolean>;
}) {
  const { disabled, draftId, snapshotRef, socketRef, loadSnapshot } = args;

  // Heartbeat: if a pick timer expires, trigger an auto-pick on the server.
  // We only call the endpoint when the local view believes the deadline has passed.
  useEffect(() => {
    if (disabled) return;
    if (!draftId) return;

    const intervalId = window.setInterval(() => {
      const current = snapshotRef.current;
      if (!current) return;
      const d = current.draft;
      if (d.status !== "IN_PROGRESS") return;
      if (!d.pick_timer_seconds) return;
      const deadlineMs = d.pick_deadline_at
        ? new Date(d.pick_deadline_at).getTime()
        : null;
      if (!deadlineMs || !Number.isFinite(deadlineMs)) return;
      if (Date.now() <= deadlineMs) return;

      void fetchJson(`/drafts/${d.id}/tick`, { method: "POST" });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [disabled, draftId, snapshotRef]);

  // Safety resync: if the websocket is disconnected during a live/paused draft,
  // periodically refresh the snapshot so the UI doesn't get stuck on stale turns.
  useEffect(() => {
    if (disabled) return;
    if (!draftId) return;

    const intervalId = window.setInterval(() => {
      const current = snapshotRef.current;
      if (!current) return;
      const status = current.draft.status ?? null;
      if (status !== "IN_PROGRESS" && status !== "PAUSED") return;

      const sock = socketRef.current;
      if (sock && sock.connected) return;

      void loadSnapshot({ preserveSnapshot: true });
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [disabled, draftId, loadSnapshot, snapshotRef, socketRef]);
}
