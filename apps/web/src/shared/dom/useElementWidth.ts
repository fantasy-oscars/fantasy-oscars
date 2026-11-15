import { useLayoutEffect, useState } from "react";
import type { RefObject } from "react";

/** The element's rendered width, kept current by a ResizeObserver. 0 until measured. */
export function useElementWidth<T extends HTMLElement>(ref: RefObject<T | null>): number {
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(el.getBoundingClientRect().width);
    read();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}
