import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { Box, Button, Group, Stack, Stepper, Text, Title } from "@mantine/core";

import { PageError, PageLoader } from "../../../ui/page-state";
import { useAdminCeremonyWorksheetOrchestration } from "../../../orchestration/adminCeremonyWorksheet";
import type { CeremonyStatus } from "../../../decisions/ceremonyWorkflow";

import { AdminCeremoniesOverviewPage } from "./AdminCeremoniesOverviewPage";
import { AdminCeremoniesCategoriesPage } from "./AdminCeremoniesCategoriesPage";
import { AdminCeremoniesNomineesPage } from "./AdminCeremoniesNomineesPage";
import { AdminCeremonyPublishPage } from "./AdminCeremonyPublishPage";
import { AdminCeremoniesWinnersPage } from "./AdminCeremoniesWinnersPage";
import { AdminCeremoniesLockPage } from "./AdminCeremoniesLockPage";
import { CeremonyWizardProvider } from "./ceremonyWizardContext";

type StepId =
  | "initialize"
  | "categories"
  | "populate"
  | "publish"
  | "results"
  | "archive";

type StepState =
  | "INCOMPLETE_EDITABLE"
  | "COMPLETE_EDITABLE"
  | "COMPLETE_LOCKED"
  | "GATED";

const STEP_ORDER: Array<{ id: StepId; label: string }> = [
  { id: "initialize", label: "Initialize ceremony" },
  { id: "categories", label: "Categories" },
  { id: "populate", label: "Populate nominees" },
  { id: "publish", label: "Publish" },
  { id: "results", label: "Results" },
  { id: "archive", label: "Archive" }
];

function inferStepFromPathname(pathname: string): StepId {
  const tail = pathname.split("/").filter(Boolean).slice(-1)[0] ?? "";
  if (tail === "initialize" || tail === "overview") return "initialize";
  if (tail === "structure" || tail === "categories") return "categories";
  if (tail === "populate" || tail === "nominees") return "populate";
  if (tail === "publish") return "publish";
  if (tail === "results" || tail === "winners") return "results";
  if (tail === "archive" || tail === "lock") return "archive";
  return "initialize";
}

function isCeremonyStatus(s: unknown): s is CeremonyStatus {
  return (
    s === "DRAFT" ||
    s === "PUBLISHED" ||
    s === "LOCKED" ||
    s === "COMPLETE" ||
    s === "ARCHIVED"
  );
}

function computeStepState(args: {
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

function stepIconFor(state: StepState): string {
  if (state === "COMPLETE_EDITABLE") return CHECK_ICON;
  if (state === "COMPLETE_LOCKED") return LOCK_ICON;
  if (state === "GATED") return LOCK_ICON;
  return DOT_ICON;
}

function GatePanel(props: { title: string; reason?: string }) {
  const { title, reason } = props;
  return (
    <Box className="status status-warning" role="status">
      <Stack gap={4}>
        <Text fw={700}>{title}</Text>
        {reason ? <Text className="muted">{reason}</Text> : null}
      </Stack>
    </Box>
  );
}

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
    if (current.state === "GATED") {
      return <GatePanel title="This step is gated." reason={current.reason} />;
    }
    if (current.id === "initialize") return <AdminCeremoniesOverviewPage />;
    if (current.id === "categories") return <AdminCeremoniesCategoriesPage />;
    if (current.id === "populate") return <AdminCeremoniesNomineesPage />;
    if (current.id === "publish") return <AdminCeremonyPublishPage />;
    if (current.id === "results") return <AdminCeremoniesWinnersPage />;
    return <AdminCeremoniesLockPage />;
  })();

  return (
    <CeremonyWizardProvider value={{ reloadWorksheet: worksheet.reloadSilent }}>
      <Group align="start" wrap="nowrap" className="wizard-shell">
        <Box className="wizard-stepper">
          <Stepper
            active={active}
            onStepClick={setActive}
            orientation="vertical"
            allowNextStepsSelect
            wrap={false}
            color="gray"
            size="xs"
            iconSize={22}
            contentPadding={0}
            styles={{
              step: { padding: "6px 0" },
              stepLabel: { fontSize: 12, lineHeight: 1.1 },
              stepBody: { paddingLeft: 8 }
            }}
          >
            {stepStates.map((s, idx) => (
              <Stepper.Step
                key={s.id}
                label={s.label}
                className={[
                  "wizard-step",
                  idx === active ? "is-active" : "",
                  s.state === "COMPLETE_EDITABLE" ? "is-complete" : "",
                  s.state === "COMPLETE_LOCKED" ? "is-locked" : "",
                  s.state === "GATED" ? "is-gated" : "",
                  s.state === "INCOMPLETE_EDITABLE" ? "is-incomplete" : "",
                  idx <= furthestCompleteIndex ? "is-progress" : "is-future",
                  idx <= furthestCompleteIndex ? "connector-gold" : "connector-gray"
                ]
                  .filter(Boolean)
                  .join(" ")}
                icon={
                  <Text
                    component="span"
                    className="gicon wizard-step-icon"
                    aria-hidden="true"
                  >
                    {stepIconFor(s.state)}
                  </Text>
                }
                progressIcon={
                  <Text
                    component="span"
                    className="gicon wizard-step-icon"
                    aria-hidden="true"
                  >
                    {stepIconFor(s.state)}
                  </Text>
                }
                completedIcon={
                  <Text
                    component="span"
                    className="gicon wizard-step-icon"
                    aria-hidden="true"
                  >
                    {stepIconFor(s.state)}
                  </Text>
                }
              />
            ))}
          </Stepper>
        </Box>

        <Box className="wizard-content">
          <Stack gap="md">
            {current.id === "populate" ? (
              <Box component="header">
                <Title order={2}>Populate nominees</Title>
              </Box>
            ) : null}
            {content}

            <Box className="wizard-nav" component="section">
              <Group justify="space-between" align="center" wrap="wrap">
                <Box>
                  <Button
                    type="button"
                    variant="subtle"
                    disabled={!canGoBack}
                    onClick={() => setActive(prevIndex)}
                  >
                    Back
                  </Button>
                </Box>
                <Box>
                  <Group gap="xs" align="center" wrap="wrap">
                    {nextDisabledReason && !canGoNext ? (
                      <Text className="muted" size="sm">
                        {nextDisabledReason}
                      </Text>
                    ) : null}
                    <Button
                      type="button"
                      disabled={!canGoNext}
                      onClick={() => setActive(nextIndex)}
                    >
                      Next
                    </Button>
                  </Group>
                </Box>
              </Group>
            </Box>
          </Stack>
        </Box>
      </Group>
    </CeremonyWizardProvider>
  );
}
