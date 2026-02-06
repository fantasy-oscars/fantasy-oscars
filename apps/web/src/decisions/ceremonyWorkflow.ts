export type CeremonyStatus = "DRAFT" | "PUBLISHED" | "LOCKED" | "COMPLETE" | "ARCHIVED";

export type CeremonyWorkflowStepId =
  | "initialize"
  | "structure"
  | "populate"
  | "publish"
  | "results"
  | "archive";

export type CeremonyWorkflowStepStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETE"
  | "LOCKED";

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
    description: "Make the ceremony visible and lock the category structure.",
    cta: "Open publish"
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

export function ceremonyStatusLabel(status: CeremonyStatus): string {
  if (status === "DRAFT") return "Draft";
  if (status === "PUBLISHED") return "Published";
  if (status === "LOCKED") return "Results in progress";
  if (status === "COMPLETE") return "Complete";
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
    ? "COMPLETE"
    : ceremony.code?.trim() || ceremony.name?.trim()
      ? "IN_PROGRESS"
      : "NOT_STARTED";

  const categoriesLocked = ceremony.status !== "DRAFT";
  const structureStatus: CeremonyWorkflowStepStatus = categoriesLocked
    ? "LOCKED"
    : stats.categories_total > 0
      ? "COMPLETE"
      : "NOT_STARTED";

  const populateComplete =
    stats.categories_total > 0 &&
    stats.nominees_total > 0 &&
    stats.categories_with_nominees === stats.categories_total;
  const populateStatus: CeremonyWorkflowStepStatus = populateComplete
    ? "COMPLETE"
    : stats.nominees_total > 0
      ? "IN_PROGRESS"
      : "NOT_STARTED";

  const publishStatus: CeremonyWorkflowStepStatus =
    ceremony.status === "DRAFT" ? "NOT_STARTED" : "COMPLETE";

  const resultsStatus: CeremonyWorkflowStepStatus =
    ceremony.status === "DRAFT"
      ? "NOT_STARTED"
      : stats.winners_total > 0
        ? "IN_PROGRESS"
        : "NOT_STARTED";

  const archiveStatus: CeremonyWorkflowStepStatus =
    ceremony.status === "ARCHIVED" ? "COMPLETE" : "NOT_STARTED";

  return [
    { id: "initialize", label: STEP_META.initialize.label, status: initStatus },
    { id: "structure", label: STEP_META.structure.label, status: structureStatus },
    { id: "populate", label: STEP_META.populate.label, status: populateStatus },
    { id: "publish", label: STEP_META.publish.label, status: publishStatus },
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

  if (ceremony.status === "DRAFT") {
    if (!hasCategories) return STEP_META.structure;
    if (!populateComplete) return STEP_META.populate;
    return STEP_META.publish;
  }

  // Once published, the most meaningful ongoing work is results entry.
  if (ceremony.status === "ARCHIVED") {
    // Archived is intentionally demoted; provide a safe "review" action.
    return STEP_META.results;
  }

  return STEP_META.results;
}

export function getCeremonyWorkflowStepMeta(step: CeremonyWorkflowStepId) {
  return STEP_META[step];
}
