import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import { io, type Socket } from "socket.io-client";
import { notify } from "../../notifications";
import type { DraftEventMessage, Snapshot } from "../../lib/types";
import { getAuthToken } from "../../lib/authToken";
import { API_BASE, describeNomination } from "./helpers";
import { buildNominationLabelById } from "../../decisions/draft";

export function useDraftSocket(args: {
  disabled?: boolean;
  snapshot: Snapshot | null;
  socketRef: RefObject<Socket | null>;
  snapshotRef: RefObject<Snapshot | null>;
  lastVersionRef: RefObject<number | null>;
  loadSnapshot: (options?: { preserveSnapshot?: boolean }) => Promise<boolean>;
  setSnapshot: Dispatch<SetStateAction<Snapshot | null>>;
  setError: (msg: string | null) => void;
}) {
  const {
    disabled,
    snapshot,
    socketRef,
    snapshotRef,
    lastVersionRef,
    loadSnapshot,
    setSnapshot,
    setError
  } = args;

  useEffect(() => {
    const draftIdForSocket = snapshot?.draft.id;
    if (!draftIdForSocket || disabled) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    // Guard against missing the "draft.started" event (e.g. reconnect timing).
    // If we see any live activity while still on a PENDING snapshot, force a resync once.
    const resyncAfterStartRef = { current: false };

    const socketBase = API_BASE
      ? new URL(API_BASE, window.location.origin).origin
      : window.location.origin;

    const socket = io(`${socketBase}/drafts`, {
      transports: ["websocket"],
      autoConnect: false,
      auth: {
        draftId: Number(draftIdForSocket),
        Authorization: (() => {
          const token = getAuthToken();
          return token ? `Bearer ${token}` : undefined;
        })()
      }
    });
    socketRef.current = socket;

    const onDraftEvent = (event: DraftEventMessage) => {
      const current = snapshotRef.current;
      const currentVersion = lastVersionRef.current;
      if (!current || currentVersion === null) return;
      if (event.draft_id !== current.draft.id) return;

      // If the draft has started server-side but this client is still on a PENDING snapshot,
      // resync to get the authoritative seat assignment (seat order is hidden pre-start).
      if (
        current.draft.status === "PENDING" &&
        event.event_type !== "draft.started" &&
        !resyncAfterStartRef.current
      ) {
        resyncAfterStartRef.current = true;
        void loadSnapshot({ preserveSnapshot: true });
        return;
      }

      if (event.event_type === "season.cancelled") {
        setError("Season cancelled.");
        setSnapshot(null);
        socket.disconnect();
        return;
      }

      const maybePick = event.payload?.pick ?? null;
      const isNewPick = Boolean(
        maybePick && !current.picks.some((p) => p.pick_number === maybePick.pick_number)
      );
      if (isNewPick && maybePick) {
        const seatLabel =
          current.seats.find((s) => s.seat_number === maybePick.seat_number)?.username ??
          `Seat ${maybePick.seat_number}`;
        const { categoryName, nomineeLabel } = describeNomination(
          current,
          maybePick.nomination_id
        );
        notify({
          id: `draft.pick.made.${maybePick.pick_number}`,
          severity: "info",
          trigger_type: "async",
          scope: "local",
          durability: "ephemeral",
          requires_decision: false,
          title: seatLabel,
          message: `${categoryName}: ${nomineeLabel}`
        });
      }

      // Draft start creates the real seat order (which is intentionally hidden pre-start).
      // Even if the pre-start snapshot includes "display seats", we must refresh so the UI
      // reflects the authoritative seat assignment for picks/turns.
      if (event.event_type === "draft.started") {
        void loadSnapshot({ preserveSnapshot: true });
        return;
      }

      // If we missed versions, resync.
      if (event.version > currentVersion + 1) {
        void loadSnapshot({ preserveSnapshot: true });
        return;
      }
      if (event.version !== currentVersion + 1) return;

      setSnapshot((prev) => {
        if (!prev || prev.draft.id !== event.draft_id) return prev;

        const nextDraft = { ...prev.draft, version: event.version };
        const hadCurrentPick =
          typeof prev.draft.current_pick_number === "number"
            ? prev.draft.current_pick_number
            : null;
        if (event.payload?.draft) {
          if (event.payload.draft.status) nextDraft.status = event.payload.draft.status;
          if ("current_pick_number" in event.payload.draft) {
            nextDraft.current_pick_number =
              event.payload.draft.current_pick_number ?? null;
          }
          if ("pick_deadline_at" in event.payload.draft) {
            const raw = (event.payload.draft as { pick_deadline_at?: unknown })
              .pick_deadline_at;
            nextDraft.pick_deadline_at = typeof raw === "string" ? raw : null;
          }
          if (event.payload.draft.completed_at !== undefined)
            nextDraft.completed_at = event.payload.draft.completed_at ?? null;
          if (event.payload.draft.started_at !== undefined)
            nextDraft.started_at = event.payload.draft.started_at ?? null;
        }

        const nextPick = event.payload?.pick;
        const isNew = Boolean(
          nextPick && !prev.picks.some((p) => p.pick_number === nextPick.pick_number)
        );
        const nextPicks = nextPick
          ? !isNew
            ? prev.picks
            : [...prev.picks, nextPick].sort((a, b) => a.pick_number - b.pick_number)
          : prev.picks;

        // Some draft events only include the new pick (and version) but omit the updated
        // `current_pick_number`. Infer it so "my turn" and seat highlighting stays in sync
        // even for short timers (e.g. 1s).
        if (isNew && nextPick) {
          const inferred = nextPick.pick_number + 1;
          const currentNum = nextDraft.current_pick_number ?? hadCurrentPick;
          if (typeof currentNum !== "number" || inferred > currentNum) {
            nextDraft.current_pick_number = inferred;
          }
        }

        return { ...prev, draft: nextDraft, picks: nextPicks, version: event.version };
      });
    };

    const onWinnersUpdated = (msg: {
      ceremony_id: number;
      category_edition_id: number;
      nomination_ids: number[];
    }) => {
      const current = snapshotRef.current;
      if (!current) return;
      // Update winners in-place for this ceremony/category.
      setSnapshot((prev) => {
        if (!prev || prev.draft.id !== current.draft.id) return prev;
        const nextWinners = [
          ...(prev.winners ?? []).filter(
            (w) => w.category_edition_id !== msg.category_edition_id
          ),
          ...msg.nomination_ids.map((id) => ({
            category_edition_id: msg.category_edition_id,
            nomination_id: id
          }))
        ];
        return { ...prev, winners: nextWinners };
      });

      const labels = buildNominationLabelById(current);
      const first = msg.nomination_ids[0];
      const winnerLabelRaw =
        typeof first === "number" ? (labels.get(first) ?? `#${first}`) : null;
      const winnerLabel =
        winnerLabelRaw && msg.nomination_ids.length > 1
          ? `${winnerLabelRaw} +${msg.nomination_ids.length - 1}`
          : winnerLabelRaw;
      const categoryName =
        current.categories?.find((c) => c.id === msg.category_edition_id)?.family_name ??
        `Category ${msg.category_edition_id}`;
      notify({
        id: "ceremony.winner.updated",
        severity: "info",
        trigger_type: "async",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: winnerLabel
          ? `${categoryName}: ${winnerLabel}`
          : `${categoryName}: updated`
      });
    };

    const onCeremonyFinalized = (msg: { ceremony_id: number; status: "COMPLETE" }) => {
      const current = snapshotRef.current;
      if (!current) return;
      // Keep the local snapshot in sync for results presentation without a full resync.
      setSnapshot((prev) => {
        if (!prev || prev.draft.id !== current.draft.id) return prev;
        return { ...prev, ceremony_status: msg.status };
      });
    };

    socket.on("draft:event", onDraftEvent);
    socket.on("ceremony:winners.updated", onWinnersUpdated);
    socket.on("ceremony:finalized", onCeremonyFinalized);
    socket.on("connect", () => {
      // Always resync on (re)connect to avoid drift if we missed events while disconnected.
      void loadSnapshot({ preserveSnapshot: true });
    });
    socket.connect();

    return () => {
      socket.off("draft:event", onDraftEvent);
      socket.off("ceremony:winners.updated", onWinnersUpdated);
      socket.off("ceremony:finalized", onCeremonyFinalized);
      socket.off("connect");
      socket.disconnect();
      socketRef.current = null;
    };
  }, [
    disabled,
    lastVersionRef,
    loadSnapshot,
    setError,
    setSnapshot,
    snapshot?.draft.id,
    snapshotRef,
    socketRef
  ]);
}
