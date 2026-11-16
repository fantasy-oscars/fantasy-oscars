import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../../../lib/api";
import { bumpContentRevision } from "../../../lib/revision";
import type { ApiResult } from "../../../lib/types";
import { notify } from "../../../notifications";
import {
  ANNOUNCEMENT_TYPE_KEY,
  ANNOUNCEMENT_TYPES,
  DYNAMIC_META,
  homeAnnouncementToReplace,
  isoToLocalInput,
  localInputToIso,
  sortAnnouncements,
  type AnnouncementType,
  type DynamicKey
} from "../../../decisions/adminContent";
import type { CmsDynamicRow } from "./types";
export type { CmsDynamicRow } from "./types";

export function useAdminAnnouncementsOrchestration() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ApiResult | null>(null);
  const [entriesRaw, setEntriesRaw] = useState<CmsDynamicRow[]>([]);

  const entries = useMemo(() => sortAnnouncements(entriesRaw), [entriesRaw]);

  const load = useCallback(async () => {
    setLoading(true);
    setStatus(null);
    const results = await Promise.all(
      ANNOUNCEMENT_TYPES.map((type) =>
        fetchJson<{ entries: CmsDynamicRow[] }>(
          `/admin/content/dynamic/${encodeURIComponent(ANNOUNCEMENT_TYPE_KEY[type])}`,
          { method: "GET" }
        )
      )
    );
    setLoading(false);
    const failed = results.find((res) => !res.ok);
    if (failed) {
      setEntriesRaw([]);
      setStatus({ ok: false, message: failed.error ?? "Failed to load announcements" });
      return;
    }
    setEntriesRaw(results.flatMap((res) => res.data?.entries ?? []));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createEntry = useCallback(
    async (type: AnnouncementType) => {
      const key = ANNOUNCEMENT_TYPE_KEY[type];
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
        setStatus({ ok: false, message: res.error ?? "Failed to create announcement" });
        return {
          ok: false as const,
          error: res.error ?? "Failed to create announcement"
        };
      }
      const draft = res.data?.draft;
      await load();
      return { ok: true as const, key, draftId: draft?.id ?? null };
    },
    [load]
  );

  const publishEntry = useCallback(
    async (entry: CmsDynamicRow) => {
      setBusy(true);
      setStatus(null);
      const res = await fetchJson<{ published: CmsDynamicRow }>(
        `/admin/content/dynamic/${encodeURIComponent(entry.key)}/drafts/${entry.id}/publish`,
        { method: "POST" }
      );
      setBusy(false);
      if (!res.ok) {
        setStatus({ ok: false, message: res.error ?? "Failed to publish" });
        return;
      }
      await load();
      notify({
        id: "admin.content.dynamic.activate.success",
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: "Announcement published"
      });
      setStatus(null);
      bumpContentRevision();
    },
    [load]
  );

  const unpublishEntry = useCallback(
    async (entry: CmsDynamicRow) => {
      setBusy(true);
      setStatus(null);
      const res = await fetchJson(
        `/admin/content/dynamic/${encodeURIComponent(entry.key)}/entries/${entry.id}/unpublish`,
        { method: "POST" }
      );
      setBusy(false);
      if (!res.ok) {
        setStatus({ ok: false, message: res.error ?? "Failed to unpublish" });
        return;
      }
      await load();
      notify({
        id: "admin.content.dynamic.deactivate.success",
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: "Announcement unpublished"
      });
      setStatus(null);
      bumpContentRevision();
    },
    [load]
  );

  return {
    loading,
    busy,
    status,
    entries,
    createEntry,
    publishEntry,
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
  const [siblings, setSiblings] = useState<CmsDynamicRow[]>([]);

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
      setSiblings([]);
      setStatus({ ok: false, message: res.error ?? "Failed to load entry" });
      return;
    }
    const list = res.data?.entries ?? [];
    setSiblings(list);
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
    notify({
      id: "admin.content.dynamic.edit.save.success",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "Saved"
    });
    setStatus(null);
    await load();
    bumpContentRevision();
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
    notify({
      id: "admin.content.dynamic.edit.publish.success",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "Published"
    });
    setStatus(null);
    await load();
    bumpContentRevision();
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
    notify({
      id: "admin.content.dynamic.edit.unpublish.success",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "Unpublished"
    });
    setStatus(null);
    await load();
    bumpContentRevision();
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
    bumpContentRevision();
    return { ok: true as const };
  }, [entry, key]);

  const isBanner = key === "banner";
  const homeToReplace = useMemo(
    () => (entry ? homeAnnouncementToReplace(siblings, entry.id) : null),
    [entry, siblings]
  );

  return {
    key,
    meta,
    loading,
    busy,
    status,
    entry,
    homeToReplace,
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
