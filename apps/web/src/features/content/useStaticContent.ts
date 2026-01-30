import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../../lib/api";

export type StaticContentState =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; content: { key: string; title: string; body_markdown: string } };

export function useStaticContent(key: string) {
  const [view, setView] = useState<StaticContentState>({ state: "loading" });

  const refresh = useCallback(async () => {
    setView({ state: "loading" });
    const res = await fetchJson<{
      content: { key: string; title: string; body_markdown: string };
    }>(`/content/static/${encodeURIComponent(key)}`, { method: "GET" });
    if (!res.ok) {
      setView({ state: "error", message: res.error ?? "Failed to load content" });
      return;
    }
    const content = res.data?.content;
    if (!content) {
      setView({ state: "error", message: "Content not found" });
      return;
    }
    setView({ state: "ready", content });
  }, [key]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { view, refresh };
}
