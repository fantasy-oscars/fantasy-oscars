import { useCallback, useEffect, useRef } from "react";

/**
 * Collapsing a rail unmounts its close button and expanding it unmounts the toggle, so
 * focus would fall to the page either way. Collapsing from the button returns focus to
 * the rail's toggle; expanding from the toggle moves focus to the rail's close button.
 * Attach `toggleRef` and `closeRef` to those buttons, call `close` from the close
 * button and `noteExpand` from the toggle just before it opens the rail.
 */
export function useRailFocusReturn(open: boolean, setOpen: (open: boolean) => void) {
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restore = useRef<"toggle" | "close" | null>(null);

  useEffect(() => {
    const target = restore.current;
    if (target === null) return;
    if (open && target === "close") {
      restore.current = null;
      closeRef.current?.focus();
    } else if (!open && target === "toggle") {
      restore.current = null;
      toggleRef.current?.focus();
    }
  }, [open]);

  const close = useCallback(() => {
    restore.current = "toggle";
    setOpen(false);
  }, [setOpen]);

  const noteExpand = useCallback(() => {
    restore.current = "close";
  }, []);

  return { toggleRef, closeRef, close, noteExpand };
}
