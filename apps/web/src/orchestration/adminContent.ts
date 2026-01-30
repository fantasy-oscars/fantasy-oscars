import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../lib/api";
import type { ApiResult } from "../lib/types";
import {
  DYNAMIC_META,
  STATIC_META,
  isoToLocalInput,
  localInputToIso,
  type DynamicKey,
  type StaticKey
} from "../decisions/adminContent";

export type CmsDynamicRow = {
  id: number;
  key: string;
  title: string;
  body_markdown: string;
  status: "DRAFT" | "PUBLISHED";
  variant?: "info" | "warning" | "success" | "error";
  dismissible?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

export function useAdminStaticContentEditorOrchestration(args: {
  key: StaticKey | null;
}) {
  const { key } = args;
  const meta = key ? STATIC_META[key] : null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<ApiResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const load = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    setLoadError(null);
    const res = await fetchJson<{
      content: { key: string; title: string; body_markdown: string } | null;
    }>(`/admin/content/static/${encodeURIComponent(key)}`, { method: "GET" });
    setLoading(false);
    if (!res.ok) {
      setTitle("");
      setBody("");
      setLoadError(res.error ?? "Failed to load content");
      return;
    }
    const content = res.data?.content;
    setTitle(content?.title ?? meta?.label ?? "");
    setBody(content?.body_markdown ?? "");
  }, [key, meta?.label]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    if (!key) return;
    setSaving(true);
    setStatus(null);
    const res = await fetchJson<{
      content: { key: string; title: string; body_markdown: string };
    }>(`/admin/content/static/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body_markdown: body })
    });
    setSaving(false);
    if (!res.ok) {
      const raw = res.error ?? "Failed to save";
      const msg =
        raw === "Unexpected error"
          ? "Save failed due to an unexpected server error."
          : raw;
      setStatus({ ok: false, message: msg });
      return;
    }
    setStatus({ ok: true, message: "Saved" });
  }, [body, key, title]);

  return {
    key,
    meta,
    loading,
    saving,
    status,
    loadError,
    title,
    setTitle,
    body,
    setBody,
    save
  };
}

export function useAdminDynamicContentLedgerOrchestration(args: {
  key: DynamicKey | null;
}) {
  const { key } = args;
  const meta = key ? DYNAMIC_META[key] : null;

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ApiResult | null>(null);
  const [entriesRaw, setEntriesRaw] = useState<CmsDynamicRow[]>([]);

  const entries = useMemo(() => {
    return [...entriesRaw].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }, [entriesRaw]);

  const load = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    setStatus(null);
    const res = await fetchJson<{ entries: CmsDynamicRow[] }>(
      `/admin/content/dynamic/${encodeURIComponent(key)}`,
      { method: "GET" }
    );
    setLoading(false);
    if (!res.ok) {
      setEntriesRaw([]);
      setStatus({ ok: false, message: res.error ?? "Failed to load content" });
      return;
    }
    setEntriesRaw(res.data?.entries ?? []);
  }, [key]);

  useEffect(() => {
    void load();
  }, [load]);

  const createEntry = useCallback(async () => {
    if (!key) return { ok: false as const, error: "Invalid key" };
    setBusy(true);
    setStatus(null);
    const res = await fetchJson<{ draft: CmsDynamicRow }>(
      `/admin/content/dynamic/${encodeURIComponent(key)}/drafts`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "", body_markdown: "" })
      }
    );
    setBusy(false);
    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Failed to create entry" });
      return { ok: false as const, error: res.error ?? "Failed to create entry" };
    }
    const draft = res.data?.draft;
    await load();
    return { ok: true as const, draftId: draft?.id ?? null };
  }, [key, load]);

  const publishDraft = useCallback(
    async (draftId: number) => {
      if (!key) return;
      setBusy(true);
      setStatus(null);
      const res = await fetchJson<{ published: CmsDynamicRow }>(
        `/admin/content/dynamic/${encodeURIComponent(key)}/drafts/${draftId}/publish`,
        { method: "POST" }
      );
      setBusy(false);
      if (!res.ok) {
        setStatus({ ok: false, message: res.error ?? "Failed to publish" });
        return;
      }
      await load();
      setStatus({ ok: true, message: "Published" });
    },
    [key, load]
  );

  const unpublishEntry = useCallback(
    async (entryId: number) => {
      if (!key) return;
      setBusy(true);
      setStatus(null);
      const res = await fetchJson(
        `/admin/content/dynamic/${encodeURIComponent(key)}/entries/${entryId}/unpublish`,
        { method: "POST" }
      );
      setBusy(false);
      if (!res.ok) {
        setStatus({ ok: false, message: res.error ?? "Failed to unpublish" });
        return;
      }
      await load();
      setStatus({ ok: true, message: "Unpublished" });
    },
    [key, load]
  );

  return {
    key,
    meta,
    loading,
    busy,
    status,
    entries,
    createEntry,
    publishDraft,
    unpublishEntry
  };
}

export function useAdminDynamicContentEditorOrchestration(args: {
  key: DynamicKey | null;
  entryId: number | null;
}) {
  const { key, entryId } = args;
  const meta = key ? DYNAMIC_META[key] : null;

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ApiResult | null>(null);
  const [entry, setEntry] = useState<CmsDynamicRow | null>(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [variant, setVariant] = useState<"info" | "warning" | "success" | "error">(
    "info"
  );
  const [dismissible, setDismissible] = useState(true);
  const [startsAtLocal, setStartsAtLocal] = useState("");
  const [endsAtLocal, setEndsAtLocal] = useState("");

  const load = useCallback(async () => {
    if (!key || entryId === null) return;
    setLoading(true);
    setStatus(null);
    const res = await fetchJson<{ entries: CmsDynamicRow[] }>(
      `/admin/content/dynamic/${encodeURIComponent(key)}`,
      { method: "GET" }
    );
    setLoading(false);
    if (!res.ok) {
      setEntry(null);
      setStatus({ ok: false, message: res.error ?? "Failed to load entry" });
      return;
    }
    const list = res.data?.entries ?? [];
    const found = list.find((r) => r.id === entryId) ?? null;
    setEntry(found);
    if (!found) setStatus({ ok: false, message: "Entry not found" });
  }, [entryId, key]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setTitle(entry?.title ?? "");
    setBody(entry?.body_markdown ?? "");
    setVariant(
      (entry?.variant as "info" | "warning" | "success" | "error" | undefined) ?? "info"
    );
    setDismissible(typeof entry?.dismissible === "boolean" ? entry.dismissible : true);
    setStartsAtLocal(isoToLocalInput(entry?.starts_at ?? null));
    setEndsAtLocal(isoToLocalInput(entry?.ends_at ?? null));
  }, [entry]);

  const save = useCallback(async () => {
    if (!key || !entry) return;
    setBusy(true);
    setStatus(null);
    const res = await fetchJson<{ draft: CmsDynamicRow }>(
      `/admin/content/dynamic/${encodeURIComponent(key)}/drafts/${entry.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body_markdown: body,
          ...(key === "banner"
            ? {
                variant,
                dismissible,
                starts_at: localInputToIso(startsAtLocal),
                ends_at: localInputToIso(endsAtLocal)
              }
            : {})
        })
      }
    );
    setBusy(false);
    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Failed to save" });
      return;
    }
    setStatus({ ok: true, message: "Saved" });
    await load();
  }, [body, dismissible, endsAtLocal, entry, key, load, startsAtLocal, title, variant]);

  const publish = useCallback(async () => {
    if (!key || !entry) return;
    if (entry.status !== "DRAFT") return;
    setBusy(true);
    setStatus(null);
    const res = await fetchJson<{ published: CmsDynamicRow }>(
      `/admin/content/dynamic/${encodeURIComponent(key)}/drafts/${entry.id}/publish`,
      { method: "POST" }
    );
    setBusy(false);
    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Failed to publish" });
      return;
    }
    setStatus({ ok: true, message: "Published" });
    await load();
  }, [entry, key, load]);

  const unpublish = useCallback(async () => {
    if (!key || !entry) return;
    if (entry.status !== "PUBLISHED") return;
    setBusy(true);
    setStatus(null);
    const res = await fetchJson(
      `/admin/content/dynamic/${encodeURIComponent(key)}/entries/${entry.id}/unpublish`,
      { method: "POST" }
    );
    setBusy(false);
    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Failed to unpublish" });
      return;
    }
    setStatus({ ok: true, message: "Unpublished" });
    await load();
  }, [entry, key, load]);

  const deleteEntry = useCallback(async () => {
    if (!key || !entry) return { ok: false as const, error: "Invalid entry" };
    if (entry.status !== "DRAFT") {
      setStatus({ ok: false, message: "Unpublish this entry before deleting." });
      return { ok: false as const, error: "Unpublish before deleting" };
    }
    setBusy(true);
    setStatus(null);
    const res = await fetchJson(
      `/admin/content/dynamic/${encodeURIComponent(key)}/entries/${entry.id}`,
      {
        method: "DELETE"
      }
    );
    setBusy(false);
    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Failed to delete" });
      return { ok: false as const, error: res.error ?? "Failed to delete" };
    }
    return { ok: true as const };
  }, [entry, key]);

  const isBanner = key === "banner";

  return {
    key,
    meta,
    loading,
    busy,
    status,
    entry,
    fields: {
      title,
      setTitle,
      body,
      setBody,
      variant,
      setVariant,
      dismissible,
      setDismissible,
      startsAtLocal,
      setStartsAtLocal,
      endsAtLocal,
      setEndsAtLocal,
      isBanner
    },
    actions: { save, publish, unpublish, deleteEntry }
  };
}
