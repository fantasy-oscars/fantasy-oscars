import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";

import { PageError, PageLoader } from "@/shared/page-state";
import { useAdminCeremonyWorksheetOrchestration } from "@/orchestration/adminCeremonyWorksheet";
import {
  STEP_ORDER,
  computeStepState,
  inferStepFromPathname,
  isCeremonyStatus
} from "@/decisions/admin/ceremonyWizard";

import { AdminCeremonyWizardScreen } from "@/features/admin/screens/ceremonies/AdminCeremonyWizardScreen";
import { AdminCeremoniesOverviewPage } from "./AdminCeremoniesOverviewPage";
import { AdminCeremoniesCategoriesPage } from "./AdminCeremoniesCategoriesPage";
import { AdminCeremoniesNomineesPage } from "./AdminCeremoniesNomineesPage";
import { AdminCeremonyPublishPage } from "./AdminCeremonyPublishPage";
import { AdminCeremoniesWinnersPage } from "./AdminCeremoniesWinnersPage";
import { AdminCeremoniesLockPage } from "./AdminCeremoniesLockPage";
import { CeremonyWizardProvider } from "./ceremonyWizardContext";

export function AdminCeremonyWizardPage() {
  const { ceremonyId: ceremonyIdRaw } = useParams();
  const ceremonyIdParsed = ceremonyIdRaw ? Number(ceremonyIdRaw) : NaN;
  const ceremonyId =
    Number.isFinite(ceremonyIdParsed) && ceremonyIdParsed > 0 ? ceremonyIdParsed : null;

  const { pathname } = useLocation();
  const initialStep = useMemo(() => inferStepFromPathname(pathname), [pathname]);

  const worksheet = useAdminCeremonyWorksheetOrchestration({ ceremonyId });

  const [active, setActive] = useState(0);

  useEffect(() => {
    const idx = STEP_ORDER.findIndex((s) => s.id === initialStep);
    setActive(idx >= 0 ? idx : 0);
  }, [initialStep]);

  if (ceremonyId === null) return <PageError message="Invalid ceremony id" />;
  if (worksheet.state === "loading") return <PageLoader label="Loading ceremony..." />;
  if (worksheet.state === "error")
    return <PageError message={worksheet.error ?? "Unable to load ceremony"} />;
  if (!worksheet.ceremony || !worksheet.stats)
    return <PageError message="Ceremony not found" />;

  const ceremony = worksheet.ceremony;
  const stats = worksheet.stats;
  const ceremonyStatus = isCeremonyStatus(ceremony.status) ? ceremony.status : "DRAFT";

  const stepStates = STEP_ORDER.map((s) => ({
    ...s,
    ...computeStepState({
      step: s.id,
      ceremony: { ...ceremony, status: ceremonyStatus },
      stats
    })
  }));

  const furthestCompleteIndex = stepStates.reduce((maxIdx, s, idx) => {
    if (s.state === "COMPLETE_EDITABLE" || s.state === "COMPLETE_LOCKED") {
      return Math.max(maxIdx, idx);
    }
    return maxIdx;
  }, -1);

  const current = stepStates[active] ?? stepStates[0];
  const currentIndex = active;
  const nextIndex = Math.min(STEP_ORDER.length - 1, currentIndex + 1);
  const prevIndex = Math.max(0, currentIndex - 1);

  const canGoBack = currentIndex > 0;
  const canGoNext =
    currentIndex < STEP_ORDER.length - 1 &&
    (current.state === "COMPLETE_EDITABLE" || current.state === "COMPLETE_LOCKED");

  const nextDisabledReason =
    currentIndex >= STEP_ORDER.length - 1
      ? null
      : current.state === "INCOMPLETE_EDITABLE" || current.state === "GATED"
        ? (current.reason ?? "Complete this step to continue.")
        : null;

  const content = (() => {
    if (current.id === "initialize") return <AdminCeremoniesOverviewPage />;
    if (current.id === "categories") return <AdminCeremoniesCategoriesPage />;
    if (current.id === "populate") return <AdminCeremoniesNomineesPage />;
    if (current.id === "publish") return <AdminCeremonyPublishPage />;
    if (current.id === "results") return <AdminCeremoniesWinnersPage />;
    return <AdminCeremoniesLockPage />;
  })();

  return (
    <CeremonyWizardProvider value={{ reloadWorksheet: worksheet.reloadSilent }}>
      <AdminCeremonyWizardScreen
        active={active}
        setActive={setActive}
        stepStates={stepStates}
        furthestCompleteIndex={furthestCompleteIndex}
        current={current}
        content={content}
        canGoBack={canGoBack}
        canGoNext={canGoNext}
        prevIndex={prevIndex}
        nextIndex={nextIndex}
        nextDisabledReason={nextDisabledReason}
      />
    </CeremonyWizardProvider>
  );
}
