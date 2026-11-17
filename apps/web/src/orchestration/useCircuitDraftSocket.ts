import { useEffect } from "react";
import { io } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import type { CircuitDraftEventMessage, CircuitDraftSnapshot } from "../lib/types";
import { API_BASE, buildSocketTarget } from "../lib/apiBase";
import { applyCircuitDraftEvent } from "../decisions/circuitDraft";
import type { DraftConnectionEvent } from "../decisions/draft/connection";
import { queryKeys } from "./query/keys";

/*
 * Live updates for a league's season draft, on the /circuits namespace (the
 * league's room). The cached snapshot is the board: each `draft:event`
 * applies to it by version (decisions/circuitDraft), an older version is
 * ignored, and a gap or an event before the snapshot is known refetches it.
 * Every (re)connect refetches it too, so a dropped connection is repaired
 * without a reload. Follows the ceremony draft's useDraftSocket.
 */

const STATUS_EVENTS = new Set(["draft.started", "draft.completed"]);

export function useCircuitDraftSocket(args: {
  circuitLeagueId: number;
  /** Members only, and only while the draft can still change. */
  enabled: boolean;
  onConnectionEvent: (event: DraftConnectionEvent) => void;
}) {
  const { circuitLeagueId, enabled, onConnectionEvent } = args;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) {
      onConnectionEvent("stop");
      return;
    }
    const draftKey = queryKeys.circuitLeagues.draft(circuitLeagueId);
    const resync = () => void queryClient.invalidateQueries({ queryKey: draftKey });
    const target = buildSocketTarget(API_BASE, "/circuits", window.location.origin);
    const socket = io(target.url, {
      ...(target.path ? { path: target.path } : {}),
      transports: ["websocket"],
      autoConnect: false,
      auth: { circuitLeagueId }
    });
    onConnectionEvent("start");

    const onDraftEvent = (message: CircuitDraftEventMessage) => {
      if (message.circuit_league_id !== circuitLeagueId) return;
      const current = queryClient.getQueryData<CircuitDraftSnapshot | null>(draftKey);
      const outcome = applyCircuitDraftEvent(current, message);
      if (outcome.kind === "applied")
        queryClient.setQueryData(draftKey, outcome.snapshot);
      else if (outcome.kind === "resync") resync();
      // The start and the end move the league's status, and the end settles
      // every roster; mark those reads stale.
      if (STATUS_EVENTS.has(message.event_type)) {
        for (const queryKey of [
          queryKeys.circuitLeagues.detail(circuitLeagueId),
          queryKeys.circuitLeagues.rosters(circuitLeagueId),
          queryKeys.circuitLeagues.transactions(circuitLeagueId)
        ]) {
          void queryClient.invalidateQueries({ queryKey });
        }
      }
    };
    const onConnect = () => {
      onConnectionEvent("connect");
      // Events sent while this client was away are not replayed.
      resync();
    };
    const onDisconnect = (reason: string) => {
      const final =
        reason === "io server disconnect" || reason === "io client disconnect";
      onConnectionEvent(final ? "disconnect_final" : "disconnect_transient");
    };
    const onConnectError = () => onConnectionEvent("connect_error");
    const onReconnectAttempt = () => onConnectionEvent("reconnect_attempt");

    socket.on("draft:event", onDraftEvent);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.io.on("reconnect_attempt", onReconnectAttempt);
    socket.connect();

    return () => {
      socket.off("draft:event", onDraftEvent);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.io.off("reconnect_attempt", onReconnectAttempt);
      socket.disconnect();
      onConnectionEvent("stop");
    };
  }, [enabled, circuitLeagueId, onConnectionEvent, queryClient]);
}
