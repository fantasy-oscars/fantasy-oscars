import { useEffect, useState } from "react";
import { toServerNowMs } from "../../decisions/draft/clockSkew";

/** Ticks once a second; returns the server's current time (local time plus the known skew). */
export function useDraftClock(serverOffsetMs: number) {
  const [localNowTs, setLocalNowTs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setLocalNowTs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return toServerNowMs(localNowTs, serverOffsetMs);
}
