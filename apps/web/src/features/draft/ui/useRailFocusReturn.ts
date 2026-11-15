import { useCallback, useEffect, useRef } from "react";

/**
 * Closing a rail unmounts its close button, so focus would fall to the page. Closing from
 * the button returns focus to the rail's toggle, which takes the pane's place.
 */
export function useRailFocusReturn(open: boolean, setOpen: (open: boolean) => void) {
  const toggleRef = useRef<HTMLButtonElement>(null);
  const restore = useRef(false);

  useEffect(() => {
    if (open || !restore.current) return;
    restore.current = false;
    toggleRef.current?.focus();
  }, [open]);

  const close = useCallback(() => {
    restore.current = true;
    setOpen(false);
  }, [setOpen]);

  return { toggleRef, close };
}
