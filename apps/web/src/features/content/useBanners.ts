import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../../lib/api";

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

export function useBanners() {
  const [view, setView] = useState<BannerState>({ state: "loading" });

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
  }, [refresh]);

  return { view, refresh };
}
