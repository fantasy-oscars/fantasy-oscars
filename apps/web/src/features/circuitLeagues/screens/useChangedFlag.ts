import { useEffect, useRef, useState } from "react";

/**
 * True for `ms` after `value` changes to another non-null value: a live
 * refresh that brought new data, not the first load. Query results keep
 * their identity while the data is unchanged, so a refetch that changed
 * nothing does not count.
 */
export function useChangedFlag(value: unknown, ms: number): boolean {
  const previous = useRef<unknown>(null);
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    const before = previous.current;
    previous.current = value;
    if (before === null || value === null || before === value) return;
    setChanged(true);
    const timer = window.setTimeout(() => setChanged(false), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return changed;
}
