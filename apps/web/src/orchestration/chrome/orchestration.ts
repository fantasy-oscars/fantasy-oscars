import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "../../lib/api";
import { invitesInboxQuery } from "../query/queries";
import { revisionFor } from "../../decisions/banners";
import { useContentRevision } from "../../lib/useContentRevision";

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
  // Shares the inbox query: refetches on window focus and whenever an invite
  // action invalidates it (no polling).
  const query = useQuery({
    ...invitesInboxQuery(),
    enabled: Boolean(userSub),
    select: (invites) => invites.length
  });
  const inviteCount = userSub ? (query.data ?? 0) : 0;
  const { refetch } = query;
  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return { inviteCount, refresh };
}
