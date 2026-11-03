import { useEffect } from "react";

/**
 * Escape disarms the selected nominee wherever focus is (the pill handles it when the
 * pill itself is focused; this covers a click on the confirm card, and phones with a
 * hardware keyboard, where focus sits in the nominee card).
 */
export function useEscapeClearsSelection(
  selectedId: number | null,
  clearSelection: () => void
) {
  useEffect(() => {
    if (selectedId == null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      clearSelection();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, clearSelection]);
}
