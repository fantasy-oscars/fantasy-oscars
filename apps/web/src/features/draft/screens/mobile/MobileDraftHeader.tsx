import { ActionIcon, Box, Button, Drawer, Group, Menu, Stack, Switch, Text } from "@ui";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AnimalAvatarIcon } from "@/shared/animalAvatarIcon";
import type { createDraftAudioController } from "@/lib/draftAudio";
import {
  computeHeaderStatus,
  isHeaderCountdownRunning
} from "@/decisions/draft/headerStatus";
import { resolvePodium } from "@/decisions/draft/podium";
import { DraftHeaderTab } from "@/features/draft/ui/DraftHeaderTab";
import { useCountdownPhase } from "@/orchestration/draft/useCountdownPhase";

export function MobileDraftHeader(props: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  backHref: string;
  participants: Array<{
    seatNumber: number;
    label: string;
    active: boolean;
    avatarKey: string | null;
  }>;
  direction: "FORWARD" | "REVERSE" | null;
  roundNumber: number | null;
  pickNumber: number | null;
  isTimerDraft: boolean;
  timerRemainingMs: number | null;
  clockText: string;
  draftStatus: string | null;
  isMyTurn: boolean;
  audioController: ReturnType<typeof createDraftAudioController>;
  audioUnlocked: boolean;
  showDraftControls: boolean;
  canManageDraft: boolean;
  onStartDraft: () => void;
  onPauseDraft: () => void;
  onResumeDraft: () => void;
  isFinalResults: boolean;
  resultsPodium: Array<{ place: 1 | 2 | 3; names: string[] }>;
  view: "draft" | "roster";
  onViewChange: (v: "draft" | "roster") => void;
  canToggleView: boolean;
  showDrafted: boolean;
  onToggleShowDrafted: (next: boolean) => void;
  showDraftedVisible: boolean;
  userLabel: string;
  userAvatarKey: string | null;
}) {
  const isPre = props.draftStatus === "PENDING";
  const isPaused = props.draftStatus === "PAUSED";
  const isCompleted = props.draftStatus === "COMPLETED";

  const countdownActive = isHeaderCountdownRunning({
    isTimerDraft: props.isTimerDraft,
    draftStatus: props.draftStatus,
    isFinalResults: props.isFinalResults,
    isMyTurn: props.isMyTurn,
    timerRemainingMs: props.timerRemainingMs
  });
  const countdownPhase = useCountdownPhase({
    active: countdownActive,
    canBeep: props.audioUnlocked,
    audioController: props.audioController
  });

  const podium = useMemo(() => resolvePodium(props.resultsPodium), [props.resultsPodium]);

  const status = computeHeaderStatus({
    draftStatus: props.draftStatus,
    isFinalResults: props.isFinalResults,
    hasPodium: podium.length > 0,
    isTimerDraft: props.isTimerDraft,
    isMyTurn: props.isMyTurn,
    countdownActive,
    countdownPhase,
    timerRemainingMs: props.timerRemainingMs,
    clockText: props.clockText,
    activeLabel: props.participants.find((p) => p.active)?.label ?? "—"
  });
  const canShowRosterLink = props.canToggleView;
  // The Settings menu holds only these two items; with neither, it would open empty.
  const showSettings =
    props.showDraftedVisible || (props.showDraftControls && props.canManageDraft);

  return (
    <Box component="header" className="dr-header dr-mobileHeader">
      <Box className="dr-mobileBar">
        <ActionIcon
          variant="subtle"
          onClick={props.onOpen}
          aria-label="Menu"
          className="dr-mobileIconBtn"
        >
          <Text component="span" className="mi-icon" aria-hidden="true">
            menu
          </Text>
        </ActionIcon>

        <DraftHeaderTab
          status={status}
          roundNumber={props.roundNumber}
          pickNumber={props.pickNumber}
          podium={podium}
        />

        {showSettings ? (
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                aria-label="Settings"
                className="dr-mobileIconBtn"
              >
                <Text component="span" className="mi-icon" aria-hidden="true">
                  settings
                </Text>
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {props.showDraftedVisible ? (
                <Menu.Item closeMenuOnClick={false}>
                  <Switch
                    size="sm"
                    label="Show drafted"
                    labelPosition="left"
                    classNames={{ root: "drh-switchRoot" }}
                    checked={props.showDrafted}
                    onChange={(e) => props.onToggleShowDrafted(e.currentTarget.checked)}
                  />
                </Menu.Item>
              ) : null}

              {props.showDraftControls && props.canManageDraft ? (
                isPre ? (
                  <Menu.Item onClick={props.onStartDraft}>Start draft</Menu.Item>
                ) : isPaused ? (
                  <Menu.Item onClick={props.onResumeDraft}>Resume draft</Menu.Item>
                ) : !isCompleted ? (
                  <Menu.Item onClick={props.onPauseDraft}>Pause draft</Menu.Item>
                ) : null
              ) : null}
            </Menu.Dropdown>
          </Menu>
        ) : (
          <Box className="dr-mobileIconBtn" aria-hidden="true" />
        )}
      </Box>

      <Drawer
        opened={props.open}
        onClose={props.onClose}
        title="Draft menu"
        position="left"
      >
        <Stack gap="md">
          <Group justify="space-between" wrap="nowrap">
            <Button component={Link} to={props.backHref} variant="outline" fullWidth>
              Back to seasons
            </Button>
          </Group>
          <Button
            type="button"
            variant="outline"
            fullWidth
            disabled={!canShowRosterLink}
            onClick={() => {
              if (!canShowRosterLink) return;
              props.onViewChange(props.view === "draft" ? "roster" : "draft");
              props.onClose();
            }}
          >
            {props.view === "draft" ? "Roster view" : "Draft view"}
          </Button>

          <Box>
            <Text className="baseline-textMeta" mb="var(--fo-space-8)">
              Draft order
            </Text>
            <Stack gap="xs">
              {props.participants.map((p) => (
                <Group key={p.seatNumber} justify="space-between" wrap="nowrap">
                  <Group gap="sm" wrap="nowrap">
                    <AnimalAvatarIcon avatarKey={p.avatarKey} />
                    <Text>{p.label}</Text>
                  </Group>
                  {p.active ? (
                    <Text
                      component="span"
                      className="mi-icon mi-icon-tiny"
                      aria-hidden="true"
                    >
                      play_arrow
                    </Text>
                  ) : null}
                </Group>
              ))}
            </Stack>
          </Box>
        </Stack>
      </Drawer>
    </Box>
  );
}
