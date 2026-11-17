import { useCallback, useEffect, useRef, useState } from "react";
import { useConfirm } from "@/notifications";
import type { ApiResult } from "@/lib/types";
import {
  SETTINGS_AREA_TITLES,
  applyAreaDraft,
  areaDraftChanged,
  areaDraftDefaults,
  areaDraftFrom,
  validateAreaDraft,
  type AreaDraft,
  type AreaMode,
  type FullSeasonSettings,
  type SettingsArea,
  type SettingsCategory,
  type SettingsEvent
} from "@/decisions/fullSeasonSettings";
import { areaStatusLine } from "@/decisions/fullSeasonSummary";
import { settingsFieldId, SETTINGS_PRIMARY_ID } from "../ui/settings/dom";
import type { OpenSettingsModal } from "../ui/settings/FullSeasonSettingsModals";

/** How a modal commits: copy into the page (create) or save to the server. */
export type SettingsCommit = "apply" | "save";

export type SettingsModalMode = SettingsCommit | "view";

export type SettingsSession = OpenSettingsModal;

type CommitResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
      requestId?: string;
      /** The stored values after a save that landed only in part. */
      latest?: FullSeasonSettings;
    };

const STATUS_LINE_MS = 3000;

function focusById(id: string) {
  // After the render that shows the error or re-enables the button.
  requestAnimationFrame(() => document.getElementById(id)?.focus());
}

/**
 * One settings modal at a time: its draft as typed, field errors, the guarded
 * close and the commit. Shared by the create page (apply locally) and the
 * season page (save each area).
 */
export function useFullSeasonSettingsModals(input: {
  settings: FullSeasonSettings;
  events: readonly SettingsEvent[];
  categories: readonly SettingsCategory[];
  modes: Record<SettingsArea, AreaMode>;
  commit: SettingsCommit;
  onCommit: (
    area: SettingsArea,
    next: FullSeasonSettings
  ) => CommitResult | Promise<CommitResult>;
}) {
  const { settings, events, categories, modes, commit, onCommit } = input;
  const { confirm } = useConfirm();
  const [open, setOpen] = useState<{
    area: SettingsArea;
    initial: AreaDraft;
    draft: AreaDraft;
    errors: Record<string, string>;
    saving: boolean;
    status: ApiResult | null;
    announcement: string;
  } | null>(null);
  const [statusLine, setStatusLine] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const showStatus = useCallback((text: string) => {
    if (timer.current) clearTimeout(timer.current);
    setStatusLine(text);
    timer.current = setTimeout(() => setStatusLine(""), STATUS_LINE_MS);
  }, []);

  const openArea = useCallback(
    (area: SettingsArea) => {
      const draft = areaDraftFrom(area, settings);
      setOpen({
        area,
        initial: draft,
        draft,
        errors: {},
        saving: false,
        status: null,
        announcement: ""
      });
    },
    [settings]
  );

  const change = useCallback((draft: AreaDraft, key?: string) => {
    setOpen((prev) => {
      if (!prev) return prev;
      const errors = { ...prev.errors };
      if (key) delete errors[key];
      return { ...prev, draft, errors, status: null };
    });
  }, []);

  /** Validates one field on blur, keeping the other fields' messages. */
  const blur = useCallback(
    (key: string) => {
      setOpen((prev) => {
        if (!prev) return prev;
        const found = validateAreaDraft(prev.area, prev.draft, events, categories).find(
          (e) => e.key === key
        );
        const errors = { ...prev.errors };
        if (found) errors[key] = found.message;
        else delete errors[key];
        return { ...prev, errors };
      });
    },
    [events, categories]
  );

  const resetDefaults = useCallback(() => {
    setOpen((prev) =>
      prev
        ? {
            ...prev,
            draft: areaDraftDefaults(prev.area, events, categories),
            errors: {},
            status: null,
            // A changed string re-announces on every press.
            announcement:
              prev.announcement === "Defaults restored."
                ? "Defaults restored. "
                : "Defaults restored."
          }
        : prev
    );
  }, [events, categories]);

  const close = useCallback(() => setOpen(null), []);

  const mode: SettingsModalMode | null = open
    ? modes[open.area] === "view"
      ? "view"
      : commit
    : null;
  const dirty = open ? areaDraftChanged(open.draft, open.initial) : false;

  /** Cancel, Escape, the close button and the overlay all come here. */
  const requestClose = useCallback(async () => {
    if (!open || open.saving) return;
    if (mode === "view" || !dirty) {
      close();
      return;
    }
    const area = SETTINGS_AREA_TITLES[open.area].toLowerCase();
    const ok = await confirm({
      title: "Discard changes?",
      message: `Your changes to ${area} haven't been ${commit === "save" ? "saved" : "applied"}.`,
      confirmLabel: "Discard",
      cancelLabel: "Keep editing"
    });
    if (ok) close();
  }, [open, mode, dirty, confirm, commit, close]);

  const submit = useCallback(async () => {
    if (!open || open.saving || mode === "view") return;
    const errors = validateAreaDraft(open.area, open.draft, events, categories);
    if (errors.length > 0) {
      setOpen({
        ...open,
        errors: Object.fromEntries(errors.map((e) => [e.key, e.message]))
      });
      focusById(settingsFieldId(errors[0]!.key));
      return;
    }
    const next = applyAreaDraft(open.area, settings, open.draft);
    if (commit === "apply") {
      await onCommit(open.area, next);
      setOpen(null);
      showStatus(areaStatusLine(open.area, false));
      return;
    }
    if (!dirty) return;
    setOpen({ ...open, saving: true, status: null });
    const result = await onCommit(open.area, next);
    if (result.ok) {
      setOpen(null);
      showStatus(areaStatusLine(open.area, true));
      return;
    }
    const { latest } = result;
    setOpen((prev) =>
      prev
        ? {
            ...prev,
            // After a partial save, compare against what is now stored, so
            // Save sends only the part that did not land; the fields keep
            // what was typed.
            initial: latest ? areaDraftFrom(prev.area, latest) : prev.initial,
            saving: false,
            status: { ok: false, message: result.message, requestId: result.requestId }
          }
        : prev
    );
    focusById(SETTINGS_PRIMARY_ID);
  }, [open, mode, events, categories, settings, commit, onCommit, dirty, showStatus]);

  const session: SettingsSession | null =
    open && mode
      ? {
          area: open.area,
          mode,
          draft: open.draft,
          errors: open.errors,
          dirty,
          saving: open.saving,
          status: open.status,
          announcement: open.announcement
        }
      : null;

  return {
    session,
    statusLine,
    openArea,
    change,
    blur,
    resetDefaults,
    requestClose: () => void requestClose(),
    submit: () => void submit()
  };
}
