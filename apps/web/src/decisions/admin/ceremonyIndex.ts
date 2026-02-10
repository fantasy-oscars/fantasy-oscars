export function computeAdminCeremonyIndexStatus(args: {
  status: string | null | undefined;
}): { statusUpper: string; isArchived: boolean; isDraft: boolean } {
  const statusUpper = String(args.status || "DRAFT").toUpperCase();
  const isArchived = statusUpper === "ARCHIVED";
  const isDraft = statusUpper === "DRAFT";
  return { statusUpper, isArchived, isDraft };
}

export function computeAdminCeremonyDeletePolicy(args: {
  status: string | null | undefined;
}): { needsConfirm: boolean; deleteDisabled: boolean } {
  const { isArchived, isDraft } = computeAdminCeremonyIndexStatus(args);
  // Unpublished drafts can be deleted immediately; other states (published/locked) confirm; archived disabled.
  const needsConfirm = !isDraft && !isArchived;
  const deleteDisabled = isArchived;
  return { needsConfirm, deleteDisabled };
}

