import { useEffect } from "react";
import { io } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import type { CircuitWaiverResultMessage } from "../lib/types";
import { API_BASE, buildSocketTarget } from "../lib/apiBase";
import { queryKeys } from "./query/keys";

/*
 * Live waiver results for a league's season, on the /circuits namespace (the
 * league's room). A `waiver:result` says a window has run, so every read it
 * changed is marked stale and refetched: results, priority and chips, the
 * viewer's claims, rosters and the transaction log. Each (re)connect does the
 * same, since events sent while the client was away are not replayed.
 */

export function useCircuitWaiverSocket(args: {
  circuitLeagueId: number;
  /** Members only: the room admits nobody else. */
  enabled: boolean;
}) {
  const { circuitLeagueId, enabled } = args;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const refresh = () => {
      for (const queryKey of [
        queryKeys.circuitLeagues.waivers(circuitLeagueId),
        queryKeys.circuitLeagues.waiverResults(circuitLeagueId),
        queryKeys.circuitLeagues.claims(circuitLeagueId),
        queryKeys.circuitLeagues.rosters(circuitLeagueId),
        queryKeys.circuitLeagues.transactions(circuitLeagueId)
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    };
    const target = buildSocketTarget(API_BASE, "/circuits", window.location.origin);
    const socket = io(target.url, {
      ...(target.path ? { path: target.path } : {}),
      transports: ["websocket"],
      autoConnect: false,
      auth: { circuitLeagueId }
    });
    let connectedBefore = false;
    const onResult = (message: CircuitWaiverResultMessage) => {
      if (message.circuit_league_id === circuitLeagueId) refresh();
    };
    const onConnect = () => {
      // The first connect follows the initial reads; a reconnect catches up.
      if (connectedBefore) refresh();
      connectedBefore = true;
    };
    socket.on("waiver:result", onResult);
    socket.on("connect", onConnect);
    socket.connect();
    return () => {
      socket.off("waiver:result", onResult);
      socket.off("connect", onConnect);
      socket.disconnect();
    };
  }, [enabled, circuitLeagueId, queryClient]);
}
