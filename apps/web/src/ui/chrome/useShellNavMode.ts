import { useEffect, useState } from "react";
import type { RefObject } from "react";

export function useShellNavMode(args: {
  navLinksRef: RefObject<HTMLDivElement | null>;
  userIsAdmin: boolean;
}) {
  const { navLinksRef, userIsAdmin } = args;
  const [navMode, setNavMode] = useState<"inline" | "drawer">("inline");

  useEffect(() => {
    const compute = () => {
      if (typeof window === "undefined") return;
      const w = window.innerWidth;
      if (w < 500) {
        setNavMode("drawer");
        return;
      }
      if (w <= 900) {
        const el = navLinksRef.current;
        if (!el) {
          // First render in this mode may happen before refs are attached.
          // Default to inline, then re-check on the next frame.
          setNavMode("inline");
          if (typeof window !== "undefined") window.requestAnimationFrame(compute);
          return;
        }
        // If links overflow their container, switch to drawer navigation.
        setNavMode(el.scrollWidth > el.clientWidth + 4 ? "drawer" : "inline");
        return;
      }
      setNavMode("inline");
    };

    const onResize = () => compute();
    compute();
    if (typeof window !== "undefined") {
      window.addEventListener("resize", onResize);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", onResize);
      }
    };
  }, [navLinksRef, userIsAdmin]);

  return { navMode };
}
