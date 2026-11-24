import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * A deep link to a section (`#add`): once the section is on the page
 * (`ready`), scroll its heading (`targetId`, focusable with tabIndex -1)
 * into view and focus it, once per navigation.
 */
export function useHashFocus(hash: string, targetId: string, ready: boolean) {
  const location = useLocation();
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || location.hash !== `#${hash}` || done.current === location.key) return;
    const target = document.getElementById(targetId);
    if (!target) return;
    done.current = location.key;
    target.scrollIntoView({ block: "start" });
    target.focus({ preventScroll: true });
  }, [ready, location.hash, location.key, hash, targetId]);
}
