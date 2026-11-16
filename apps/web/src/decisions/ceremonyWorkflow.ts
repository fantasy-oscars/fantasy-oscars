import { isCeremonyContentEditable, type CeremonyStatus } from "./ceremonyLifecycle";

export type { CeremonyStatus };

export type CeremonyWorkflowStepId =
  "initialize" | "structure" | "populate" | "publish" | "open" | "results" | "archive";

export type CeremonyWorkflowStepStatus =
  "NOT_STARTED" | "IN_PROGRESS" | "DONE" | "LOCKED";

export type CeremonyWorkflowStepMeta = {
  id: CeremonyWorkflowStepId;
  label: string;
  nextLabel: string;
  description: string;
  cta: string;
};

const STEP_META: Record<CeremonyWorkflowStepId, CeremonyWorkflowStepMeta> = {
  initialize: {
    id: "initialize",
    label: "Initialize",
    nextLabel: "Initialize ceremony",
    description: "Set the ceremony name, code, and key dates.",
    cta: "Open initialize"
  },
  structure: {
    id: "structure",
    label: "Structure categories",
    nextLabel: "Structure categories",
    description: "Define categories and the nominee type for each.",
    cta: "Open categories"
  },
  populate: {
    id: "populate",
    label: "Populate nominees",
    nextLabel: "Populate nominees",
    description: "Add nominees to each category so leagues can draft.",
    cta: "Open nominees"
  },
  publish: {
    id: "publish",
    label: "Publish",
    nextLabel: "Publish ceremony",
    description:
      "Make the ceremony visible. Categories and nominees stay editable until it opens for leagues.",
    cta: "Open publish"
  },
  open: {
    id: "open",
    label: "Open for leagues",
    nextLabel: "Open for leagues",
    description:
      "Let leagues create seasons and drafts. This locks categories and nominees.",
    cta: "Open for leagues"
  },
  results: {
    id: "results",
    label: "Results",
    nextLabel: "Enter results",
    description: "Record winners as results are announced (supports multiple winners).",
    cta: "Open results"
  },
  archive: {
    id: "archive",
    label: "Archive",
    nextLabel: "Archive ceremony",
    description: "Mark the ceremony inactive and remove it from current views.",
    cta: "Archive"
  }
};

export function ceremonyStatusLabel(
  status: CeremonyStatus,
  resultsFinalizedAt?: string | null
): string {
  if (status === "DRAFT") return "Draft";
  if (status === "PUBLISHED") return "Published";
  if (status === "ACTIVE") return "Open for leagues";
  if (status === "LOCKED")
    return resultsFinalizedAt ? "Results final" : "Results in progress";
  return "Archived";
}

export function getCeremonyWorkflowSteps(args: {
  ceremony: { status: CeremonyStatus; code: string | null; name: string | null };
  stats: {
    categories_total: number;
    categories_with_nominees: number;
    nominees_total: number;
    winners_total: number;
  };
}): Array<{
  id: CeremonyWorkflowStepId;
  label: string;
  status: CeremonyWorkflowStepStatus;
}> {
  const { ceremony, stats } = args;

  const hasIdentity = Boolean(ceremony.code?.trim() && ceremony.name?.trim());
  const initStatus: CeremonyWorkflowStepStatus = hasIdentity
    ? "DONE"
    : ceremony.code?.trim() || ceremony.name?.trim()
      ? "IN_PROGRESS"
      : "NOT_STARTED";

  const categoriesLocked = !isCeremonyContentEditable(ceremony.status);
  const structureStatus: CeremonyWorkflowStepStatus = categoriesLocked
    ? "LOCKED"
    : stats.categories_total > 0
      ? "DONE"
      : "NOT_STARTED";

  const populateComplete =
    stats.categories_total > 0 &&
    stats.nominees_total > 0 &&
    stats.categories_with_nominees === stats.categories_total;
  const populateStatus: CeremonyWorkflowStepStatus = populateComplete
    ? "DONE"
    : stats.nominees_total > 0
      ? "IN_PROGRESS"
      : "NOT_STARTED";

  const publishStatus: CeremonyWorkflowStepStatus =
    ceremony.status === "DRAFT" ? "NOT_STARTED" : "DONE";

  const openStatus: CeremonyWorkflowStepStatus = isCeremonyContentEditable(
    ceremony.status
  )
    ? "NOT_STARTED"
    : "DONE";

  const resultsStatus: CeremonyWorkflowStepStatus =
    ceremony.status === "DRAFT"
      ? "NOT_STARTED"
      : stats.winners_total > 0
        ? "IN_PROGRESS"
        : "NOT_STARTED";

  const archiveStatus: CeremonyWorkflowStepStatus =
    ceremony.status === "ARCHIVED" ? "DONE" : "NOT_STARTED";

  return [
    { id: "initialize", label: STEP_META.initialize.label, status: initStatus },
    { id: "structure", label: STEP_META.structure.label, status: structureStatus },
    { id: "populate", label: STEP_META.populate.label, status: populateStatus },
    { id: "publish", label: STEP_META.publish.label, status: publishStatus },
    { id: "open", label: STEP_META.open.label, status: openStatus },
    { id: "results", label: STEP_META.results.label, status: resultsStatus },
    { id: "archive", label: STEP_META.archive.label, status: archiveStatus }
  ];
}

export function getNextCeremonyWorkflowStep(args: {
  ceremony: { status: CeremonyStatus; code: string | null; name: string | null };
  stats: {
    categories_total: number;
    categories_with_nominees: number;
    nominees_total: number;
    winners_total: number;
  };
}): CeremonyWorkflowStepMeta | null {
  const { ceremony, stats } = args;

  const hasIdentity = Boolean(ceremony.code?.trim() && ceremony.name?.trim());
  const hasCategories = stats.categories_total > 0;
  const populateComplete =
    stats.categories_total > 0 &&
    stats.nominees_total > 0 &&
    stats.categories_with_nominees === stats.categories_total;

  if (!hasIdentity) return STEP_META.initialize;

  // A ceremony can be published with only its identity and dates; content
  // follows, and opening for leagues needs every category populated.
  if (ceremony.status === "DRAFT" || ceremony.status === "PUBLISHED") {
    if (!hasCategories) return STEP_META.structure;
    if (!populateComplete) return STEP_META.populate;
    return ceremony.status === "DRAFT" ? STEP_META.publish : STEP_META.open;
  }

  // Once open for leagues, the most meaningful ongoing work is results entry.
  if (ceremony.status === "ARCHIVED") {
    // Archived is intentionally demoted; provide a safe "review" action.
    return STEP_META.results;
  }

  return STEP_META.results;
}

export function getCeremonyWorkflowStepMeta(step: CeremonyWorkflowStepId) {
  return STEP_META[step];
}
