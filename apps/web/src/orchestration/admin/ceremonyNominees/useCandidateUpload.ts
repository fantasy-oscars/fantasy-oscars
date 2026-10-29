import { useCallback, useMemo, useState } from "react";
import { readJsonFile } from "../../../lib/files";
import { fetchJson } from "../../../lib/api";
import type { ApiResult } from "../../../lib/types";
import { summarizeCandidateDataset } from "../../../decisions/admin/candidateDatasetSummary";
import { formatCandidateImportMessage } from "../../../decisions/admin/nomineeLists";

/** Candidate-film JSON upload: file parsing, summary and the import request. */
export function useCandidateUpload(ceremonyId: number | null) {
  const [candidateUploading, setCandidateUploading] = useState(false);
  const [candidateUploadState, setCandidateUploadState] = useState<ApiResult | null>(
    null
  );
  const [candidateDataset, setCandidateDataset] = useState<unknown | null>(null);
  const [candidateSummary, setCandidateSummary] = useState<{ films: number } | null>(
    null
  );

  const summarizeCandidates = useCallback((dataset: unknown) => {
    setCandidateSummary(summarizeCandidateDataset(dataset));
  }, []);

  const onCandidateFile = useCallback(
    async (file: File | null) => {
      if (!file) {
        setCandidateDataset(null);
        setCandidateSummary(null);
        return;
      }
      try {
        const parsed = await readJsonFile(file);
        setCandidateDataset(parsed);
        summarizeCandidates(parsed);
        setCandidateUploadState({ ok: true, message: `Loaded ${file.name}` });
      } catch (err) {
        setCandidateDataset(null);
        setCandidateSummary(null);
        const message = err instanceof Error ? err.message : "Invalid JSON file";
        setCandidateUploadState({ ok: false, message });
      }
    },
    [summarizeCandidates]
  );

  const onCandidateFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      await onCandidateFile(e.target.files?.[0] ?? null);
    },
    [onCandidateFile]
  );

  const resetCandidates = useCallback(() => {
    setCandidateDataset(null);
    setCandidateSummary(null);
    setCandidateUploadState(null);
  }, []);

  const uploadCandidateFilms = useCallback(async () => {
    if (!candidateDataset) {
      setCandidateUploadState({ ok: false, message: "Select a JSON dataset first." });
      return;
    }
    if (ceremonyId === null || !Number.isFinite(ceremonyId) || ceremonyId <= 0) {
      setCandidateUploadState({ ok: false, message: "Invalid ceremony id." });
      return;
    }
    setCandidateUploading(true);
    setCandidateUploadState(null);
    const res = await fetchJson(`/admin/films/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(candidateDataset)
    });
    setCandidateUploading(false);
    setCandidateUploadState({
      ok: res.ok,
      message: res.ok
        ? formatCandidateImportMessage(res.data)
        : (res.error ?? "Load failed")
    });
  }, [candidateDataset, ceremonyId]);

  const candidateSummaryView = useMemo(() => {
    if (!candidateSummary) return "No dataset loaded.";
    return `Films: ${candidateSummary.films}`;
  }, [candidateSummary]);

  return {
    candidateUploading,
    candidateUploadState,
    candidateDataset,
    candidateSummary,
    candidateSummaryView,
    setCandidateDataset,
    setCandidateSummary,
    onCandidateFile,
    onCandidateFileChange,
    resetCandidates,
    uploadCandidateFilms
  };
}
