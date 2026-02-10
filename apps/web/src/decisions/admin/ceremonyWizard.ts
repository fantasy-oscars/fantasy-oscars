import type { CeremonyStatus } from "../ceremonyWorkflow";

export type StepId =
  | "initialize"
  | "categories"
  | "populate"
  | "publish"
  | "results"
  | "archive";

export type StepState =
  | "INCOMPLETE_EDITABLE"
  | "COMPLETE_EDITABLE"
  | "COMPLETE_LOCKED"
  | "GATED";

export const STEP_ORDER: Array<{ id: StepId; label: string }> = [
  { id: "initialize", label: "Initialize ceremony" },
  { id: "categories", label: "Categories" },
  { id: "populate", label: "Populate nominees" },
  { id: "publish", label: "Publish" },
  { id: "results", label: "Results" },
  { id: "archive", label: "Archive" }
];

export function inferStepFromPathname(pathname: string): StepId {
  const tail = pathname.split("/").filter(Boolean).slice(-1)[0] ?? "";
  if (tail === "initialize" || tail === "overview") return "initialize";
  if (tail === "structure" || tail === "categories") return "categories";
  if (tail === "populate" || tail === "nominees") return "populate";
  if (tail === "publish") return "publish";
  if (tail === "results" || tail === "winners") return "results";
  if (tail === "archive" || tail === "lock") return "archive";
  return "initialize";
}

export function isCeremonyStatus(s: unknown): s is CeremonyStatus {
  return (
    s === "DRAFT" ||
    s === "PUBLISHED" ||
    s === "LOCKED" ||
    s === "COMPLETE" ||
    s === "ARCHIVED"
  );
}

export function computeStepState(args: {
  step: StepId;
  ceremony: { status: CeremonyStatus; code: string | null; name: string | null };
  stats: {
    categories_total: number;
    categories_with_nominees: number;
    nominees_total: number;
    winners_total: number;
  };
}): { state: StepState; reason?: string } {
  const { step, ceremony, stats } = args;
  const hasIdentity = Boolean(ceremony.code?.trim() && ceremony.name?.trim());
  const hasCategories = stats.categories_total > 0;
  const nomineesComplete =
    stats.categories_total > 0 &&
    stats.nominees_total > 0 &&
    stats.categories_with_nominees === stats.categories_total;

  if (step === "initialize") {
    if (ceremony.status === "ARCHIVED") return { state: "COMPLETE_LOCKED" };
    return {
      state: hasIdentity ? "COMPLETE_EDITABLE" : "INCOMPLETE_EDITABLE",
      reason: hasIdentity ? undefined : "Requires a ceremony name and code."
    };
  }

  if (step === "categories") {
    if (!hasIdentity)
      return { state: "GATED", reason: "Requires ceremony name and code." };
    if (ceremony.status !== "DRAFT") return { state: "COMPLETE_LOCKED" };
    return {
      state: hasCategories ? "COMPLETE_EDITABLE" : "INCOMPLETE_EDITABLE",
      reason: hasCategories ? undefined : "Requires at least one category."
    };
  }

  if (step === "populate") {
    if (!hasIdentity)
      return { state: "GATED", reason: "Requires ceremony name and code." };
    if (!hasCategories)
      return { state: "GATED", reason: "Requires at least one category." };
    if (ceremony.status === "ARCHIVED") return { state: "COMPLETE_LOCKED" };
    return {
      state: nomineesComplete ? "COMPLETE_EDITABLE" : "INCOMPLETE_EDITABLE",
      reason: nomineesComplete ? undefined : "Requires nominees for every category."
    };
  }

  if (step === "publish") {
    if (!hasIdentity)
      return { state: "GATED", reason: "Requires ceremony name and code." };
    if (!hasCategories)
      return { state: "GATED", reason: "Requires at least one category." };
    if (!nomineesComplete)
      return { state: "GATED", reason: "Requires nominees for every category." };
    if (ceremony.status === "DRAFT") return { state: "INCOMPLETE_EDITABLE" };
    return { state: "COMPLETE_LOCKED" };
  }

  if (step === "results") {
    if (ceremony.status === "DRAFT")
      return { state: "GATED", reason: "Publish the ceremony to enter results." };
    if (ceremony.status === "ARCHIVED") return { state: "COMPLETE_LOCKED" };
    if (ceremony.status === "COMPLETE") return { state: "COMPLETE_LOCKED" };
    return {
      state: stats.winners_total > 0 ? "COMPLETE_EDITABLE" : "INCOMPLETE_EDITABLE",
      reason:
        stats.winners_total > 0
          ? undefined
          : "Add at least one winner to complete results."
    };
  }

  // archive
  if (ceremony.status === "DRAFT")
    return { state: "GATED", reason: "Publish the ceremony before archiving." };
  if (ceremony.status === "ARCHIVED") return { state: "COMPLETE_LOCKED" };
  return {
    state: "INCOMPLETE_EDITABLE",
    reason: "Archive the ceremony to complete this step."
  };
}

const CHECK_ICON = String.fromCharCode(0xe5ca);
const LOCK_ICON = String.fromCharCode(0xe897);
const DOT_ICON = String.fromCharCode(0xe061);

export function stepIconFor(state: StepState): string {
  if (state === "COMPLETE_EDITABLE") return CHECK_ICON;
  if (state === "COMPLETE_LOCKED") return LOCK_ICON;
  if (state === "GATED") return LOCK_ICON;
  return DOT_ICON;
}

