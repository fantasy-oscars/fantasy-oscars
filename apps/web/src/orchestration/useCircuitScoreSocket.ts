import { useEffect } from "react";
import { io } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import type { CircuitScoreUpdateMessage } from "../lib/types";
import { API_BASE, buildSocketTarget } from "../lib/apiBase";
import { queryKeys } from "./query/keys";

/*
 * Live standings for a league's season, on the /circuits namespace (the
 * league's room). A `score:update` says the scoring ledger changed, so the
 * standings and every ceremony breakdown are marked stale and refetched.
 * Each reconnect does the same, since events sent while the client was away
 * are not replayed.
 */

export function useCircuitScoreSocket(args: {
  circuitLeagueId: number;
  /** Members only: the room admits nobody else. */
  enabled: boolean;
}) {
  const { circuitLeagueId, enabled } = args;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const refresh = () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.circuitLeagues.standings(circuitLeagueId)
      });
    };
    const target = buildSocketTarget(API_BASE, "/circuits", window.location.origin);
    const socket = io(target.url, {
      ...(target.path ? { path: target.path } : {}),
      transports: ["websocket"],
      autoConnect: false,
      auth: { circuitLeagueId }
    });
    let connectedBefore = false;
    const onUpdate = (message: CircuitScoreUpdateMessage) => {
      if (message.circuit_league_id === circuitLeagueId) refresh();
    };
    const onConnect = () => {
      // The first connect follows the initial reads; a reconnect catches up.
      if (connectedBefore) refresh();
      connectedBefore = true;
    };
    socket.on("score:update", onUpdate);
    socket.on("connect", onConnect);
    socket.connect();
    return () => {
      socket.off("score:update", onUpdate);
      socket.off("connect", onConnect);
      socket.disconnect();
    };
  }, [enabled, circuitLeagueId, queryClient]);
}
