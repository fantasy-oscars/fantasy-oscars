import type { ReactNode } from "react";
import { Box, Button, Group, Stack, Stepper, Text, Title } from "@ui";
import type { StepId, StepState } from "@/decisions/admin/ceremonyWizard";
import { stepIconFor } from "@/decisions/admin/ceremonyWizard";
import { FO_ICON_SIZE_SM_PX } from "@/tokens/sizes";

export type WizardStepRow = {
  id: StepId;
  label: string;
  state: StepState;
  reason?: string;
};

function GatePanel(props: { title: string; reason?: string }) {
  const { title, reason } = props;
  return (
    <Box className="status status-warning" role="status">
      <Stack gap="var(--fo-space-4)">
        <Text fw="var(--fo-font-weight-bold)">{title}</Text>
        {reason ? <Text className="muted">{reason}</Text> : null}
      </Stack>
    </Box>
  );
}

export function AdminCeremonyWizardScreen(props: {
  active: number;
  setActive: (idx: number) => void;
  stepStates: WizardStepRow[];
  furthestCompleteIndex: number;
  current: WizardStepRow;
  content: ReactNode;
  canGoBack: boolean;
  canGoNext: boolean;
  prevIndex: number;
  nextIndex: number;
  nextDisabledReason: string | null;
}) {
  const {
    active,
    setActive,
    stepStates,
    furthestCompleteIndex,
    current,
    content,
    canGoBack,
    canGoNext,
    prevIndex,
    nextIndex,
    nextDisabledReason
  } = props;

  return (
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
          iconSize={FO_ICON_SIZE_SM_PX}
          contentPadding={0}
          styles={{
            step: { padding: "var(--fo-space-dense-1) var(--fo-space-0)" },
            stepLabel: {
              fontSize: "var(--fo-font-size-xs)",
              lineHeight: "var(--fo-line-height-tight)"
            },
            stepBody: { paddingLeft: "var(--fo-space-8)" }
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
          {current.state === "GATED" ? (
            <GatePanel title="This step is gated." reason={current.reason} />
          ) : current.id === "populate" ? (
            <Box component="header">
              <Title order={2}>Populate nominees</Title>
            </Box>
          ) : null}

          {current.state === "GATED" ? null : content}

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
                    className={canGoNext ? "fo-buttonColorPrimary" : "fo-buttonColorMuted"}
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
  );
}
