import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import type { Socket } from "socket.io-client";
import type { Snapshot } from "../../lib/types";
import { buildCursorSpyCursors } from "../../decisions/draft/boards";

type RemoteCursors = Record<number, { x: number; y: number; ts: number }>;

const CURSOR_TTL_MS = 3200;
const CURSOR_SWEEP_INTERVAL_MS = 800;

/** Remote cursor tracking (expiry sweep, outgoing emit) for the live draft room. */
export function useDraftCursorSpy(args: {
  snapshot: Snapshot | null;
  socketRef: RefObject<Socket | null>;
  disableCursorSpy?: boolean;
}) {
  const { snapshot, socketRef, disableCursorSpy } = args;
  const [remoteCursorByUserId, setRemoteCursorByUserId] = useState<RemoteCursors>({});

  const draftStatus = snapshot?.draft.status ?? null;
  const enabled =
    !disableCursorSpy && (draftStatus === "IN_PROGRESS" || draftStatus === "PAUSED");

  const upsertRemoteCursor = useCallback(
    (cursor: { userId: number; x: number; y: number; ts: number }) => {
      setRemoteCursorByUserId((prev) => ({
        ...prev,
        [cursor.userId]: { x: cursor.x, y: cursor.y, ts: cursor.ts }
      }));
    },
    []
  );

  useEffect(() => {
    if (!enabled) {
      setRemoteCursorByUserId({});
      return;
    }
    const intervalId = window.setInterval(() => {
      const now = Date.now();
      setRemoteCursorByUserId((prev) => {
        const next: RemoteCursors = {};
        let changed = false;
        for (const [rawUserId, item] of Object.entries(prev)) {
          const userId = Number(rawUserId);
          if (!Number.isFinite(userId) || now - item.ts > CURSOR_TTL_MS) {
            changed = true;
            continue;
          }
          next[userId] = item;
        }
        return changed ? next : prev;
      });
    }, CURSOR_SWEEP_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [enabled]);

  const emit = useCallback(
    (x: number, y: number) => {
      if (!enabled) return;
      const socket = socketRef.current;
      if (!socket || !socket.connected) return;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      socket.emit("draft:cursor", {
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y))
      });
    },
    [enabled, socketRef]
  );

  const cursors = useMemo(
    () => buildCursorSpyCursors({ snapshot, enabled, remoteCursorByUserId }),
    [enabled, remoteCursorByUserId, snapshot]
  );

  return { enabled, cursors, emit, upsertRemoteCursor };
}
