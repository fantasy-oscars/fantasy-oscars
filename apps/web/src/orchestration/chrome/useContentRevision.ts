import { useEffect, useState } from "react";
import {
  CONTENT_REVISION_EVENT,
  CONTENT_REVISION_STORAGE_KEY,
  getContentRevision
} from "../../lib/revision";

// Tracks the current content revision so long-lived screens can refresh
// CMS-driven content (banners, landing content, etc.) without requiring a reload.
export function useContentRevision(): number {
  const [rev, setRev] = useState(() => getContentRevision());

  useEffect(() => {
    const sync = () => setRev(getContentRevision());
    const onStorage = (e: StorageEvent) => {
      if (e.key === CONTENT_REVISION_STORAGE_KEY) sync();
    };

    window.addEventListener(CONTENT_REVISION_EVENT, sync);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener(CONTENT_REVISION_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return rev;
}

