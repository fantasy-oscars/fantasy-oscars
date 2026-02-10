import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../lib/api";
import { revisionFor } from "../decisions/banners";
import { useContentRevision } from "../lib/useContentRevision";

export type BannerRow = {
  id: number;
  title: string;
  body_markdown: string;
  variant: "info" | "warning" | "success" | "error";
  dismissible: boolean;
  starts_at: string | null;
  ends_at: string | null;
  published_at: string | null;
  updated_at?: string;
};

export type BannerState =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; banners: BannerRow[] };

const STORAGE_PREFIX = "fantasyoscars_banner_dismissed_";

function isDismissed(id: number, revision: string) {
  try {
    return window.localStorage.getItem(`${STORAGE_PREFIX}${id}`) === revision;
  } catch {
    return false;
  }
}

function dismiss(id: number, revision: string) {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${id}`, revision);
  } catch {
    // ignore
  }
}

function clearDismiss(id: number) {
  try {
    window.localStorage.removeItem(`${STORAGE_PREFIX}${id}`);
  } catch {
    // ignore
  }
}

export function useBannerOrchestration() {
  const [view, setView] = useState<BannerState>({ state: "loading" });
  const [dismissTick, setDismissTick] = useState(0);
  const rev = useContentRevision();

  const refresh = useCallback(async () => {
    setView({ state: "loading" });
    const res = await fetchJson<{ banners: BannerRow[] }>("/content/banners", {
      method: "GET"
    });
    if (!res.ok) {
      setView({ state: "error", message: res.error ?? "Failed to load banners" });
      return;
    }
    setView({ state: "ready", banners: res.data?.banners ?? [] });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, rev]);

  const visibleBanners = useMemo(() => {
    // Force recompute after localStorage dismiss without waiting on a refetch.
    void dismissTick;
    if (view.state !== "ready") return [];
    return view.banners.filter(
      (b) =>
        String(b.body_markdown ?? "").trim().length > 0 &&
        // Show/hide depends on dismissible + dismissed.
        // If a banner is not dismissible, it always shows (and we clear any stale dismiss state).
        (() => {
          const rev = revisionFor(b);
          if (!b.dismissible) {
            clearDismiss(b.id);
            return true;
          }
          return !isDismissed(b.id, rev);
        })()
    );
  }, [dismissTick, view]);

  const dismissBanner = useCallback(
    (id: number) => {
      if (view.state !== "ready") return;
      const b = view.banners.find((x) => x.id === id);
      if (!b) return;
      dismiss(id, revisionFor(b));
      setDismissTick((n) => n + 1);
    },
    [view]
  );

  return { view, visibleBanners, refresh, dismissBanner };
}

export function useInviteCountOrchestration(userSub?: string) {
  const [inviteCount, setInviteCount] = useState<number>(0);

  const refresh = useCallback(async () => {
    if (!userSub) {
      setInviteCount(0);
      return;
    }
    const res = await fetchJson<{ invites: Array<{ id: number }> }>(
      "/seasons/invites/inbox",
      {
        method: "GET"
      }
    );
    if (!res.ok) {
      setInviteCount(0);
      return;
    }
    setInviteCount(Array.isArray(res.data?.invites) ? res.data!.invites.length : 0);
  }, [userSub]);

  useEffect(() => {
    void refresh();

    // Keep the chrome bell in sync:
    // - immediately on local invite actions (accept/decline)
    // - periodically, so invites sent from other users appear without a full refresh
    const onInvitesChanged = () => void refresh();
    const onFocus = () => void refresh();
    const interval =
      typeof window !== "undefined" ? window.setInterval(onInvitesChanged, 15_000) : null;

    if (typeof window !== "undefined") {
      window.addEventListener("fo:invites-changed", onInvitesChanged as EventListener);
      window.addEventListener("focus", onFocus);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(
          "fo:invites-changed",
          onInvitesChanged as EventListener
        );
        window.removeEventListener("focus", onFocus);
        if (interval) window.clearInterval(interval);
      }
    };
  }, [refresh]);

  return { inviteCount, refresh };
}
