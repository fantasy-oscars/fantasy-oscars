import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../../lib/api";

export type DynamicContentState =
  | { state: "loading" }
  | { state: "error"; message: string }
  | {
      state: "ready";
      content: {
        id: number;
        key: string;
        title: string;
        body_markdown: string;
        published_at: string | null;
      } | null;
    };

export function useDynamicContent(key: string) {
  const [view, setView] = useState<DynamicContentState>({ state: "loading" });

  const refresh = useCallback(async () => {
    setView({ state: "loading" });
    const res = await fetchJson<{
      content: {
        id: number;
        key: string;
        title: string;
        body_markdown: string;
        published_at: string | null;
      } | null;
    }>(`/content/dynamic/${encodeURIComponent(key)}`, { method: "GET" });
    if (!res.ok) {
      setView({ state: "error", message: res.error ?? "Failed to load content" });
      return;
    }
    setView({ state: "ready", content: res.data?.content ?? null });
  }, [key]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { view, refresh };
}
