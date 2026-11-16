import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../../lib/api";

export type DynamicContent = {
  id: number;
  key: string;
  title: string;
  body_markdown: string;
  published_at: string | null;
};

export type DynamicContentView =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; content: DynamicContent | null };

export function useDynamicContentOrchestration(key: string) {
  const [view, setView] = useState<DynamicContentView>({ state: "loading" });

  const refresh = useCallback(async () => {
    setView({ state: "loading" });
    const res = await fetchJson<{ content: DynamicContent | null }>(
      `/content/dynamic/${encodeURIComponent(key)}`,
      { method: "GET" }
    );
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
