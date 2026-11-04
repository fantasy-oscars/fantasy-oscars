import { useEffect, useRef, useState, type RefObject } from "react";

export function useShellNavMode(args: {
  navLinksRef: RefObject<HTMLDivElement | null>;
  headerRowRef: RefObject<HTMLDivElement | null>;
  userIsAdmin: boolean;
  /** Changes when the header's right-hand controls change (signed out, loading, signed in). */
  sessionKey: string;
}) {
  const { navLinksRef, headerRowRef, userIsAdmin, sessionKey } = args;
  const [navMode, setNavMode] = useState<"inline" | "drawer">("inline");
  const modeRef = useRef(navMode);
  modeRef.current = navMode;
  // Widest viewport at which the inline header row overflowed. The drawer drops the
  // header's text buttons, so the row cannot be measured again until the viewport grows.
  const rowOverflowFloor = useRef(0);

  useEffect(() => {
    rowOverflowFloor.current = 0;
  }, [sessionKey, userIsAdmin]);

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
        if (w <= rowOverflowFloor.current) {
          setNavMode("drawer");
          return;
        }
        // If the header row overflows while inline, nothing may wrap or spill: use the drawer.
        const row = headerRowRef.current;
        if (modeRef.current === "inline" && row && row.scrollWidth > row.clientWidth) {
          rowOverflowFloor.current = w;
          setNavMode("drawer");
          return;
        }
        // If links overflow their container, switch to drawer navigation.
        setNavMode(el.scrollWidth > el.clientWidth + 4 ? "drawer" : "inline");
        return;
      }
      rowOverflowFloor.current = 0;
      setNavMode("inline");
    };

    const onResize = () => compute();
    compute();
    // A mode flip changes what the header holds, so measure once more after it paints.
    const frame = window.requestAnimationFrame(compute);
    if (typeof window !== "undefined") {
      window.addEventListener("resize", onResize);
    }
    return () => {
      window.cancelAnimationFrame(frame);
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", onResize);
      }
    };
  }, [navLinksRef, headerRowRef, userIsAdmin, sessionKey, navMode]);

  return { navMode };
}
