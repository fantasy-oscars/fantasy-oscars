import { useLayoutEffect } from "react";
import type { RefObject } from "react";

// Central helper to avoid `style={{ transform, transition }}` usage for sortable rows.
export function useSortableInlineStyle<T extends HTMLElement>(
  ref: RefObject<T | null>,
  style: { transform?: string; transition?: string }
) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (style.transform !== undefined) el.style.transform = style.transform;
    if (style.transition !== undefined) el.style.transition = style.transition;

    return () => {
      // Clean up to prevent stale transforms after unmount or when DnD ends.
      el.style.transform = "";
      el.style.transition = "";
    };
  }, [ref, style.transform, style.transition]);
}
