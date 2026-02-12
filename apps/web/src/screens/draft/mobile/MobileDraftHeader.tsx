import {
  ActionIcon,
  Box,
  Button,
  Drawer,
  Group,
  Menu,
  Stack,
  Switch,
  Text
} from "@ui";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimalAvatarIcon } from "@/shared/animalAvatarIcon";
import type { createDraftAudioController } from "../../../lib/draftAudio";
import { playCountdownBeep } from "../../../lib/draftAudio";
import { COUNTDOWN_BEEP_INTERVAL_MS, isCountdownActive } from "../../../lib/draftCountdown";

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
  resultsWinnerLabel: string | null;
  view: "draft" | "roster";
  onViewChange: (v: "draft" | "roster") => void;
  canToggleView: boolean;
  showDrafted: boolean;
  onToggleShowDrafted: (next: boolean) => void;
  showDraftedVisible: boolean;
  themeIcon: string;
  onToggleTheme: () => void;
  userLabel: string;
  userAvatarKey: string | null;
}) {
  const isPre = props.draftStatus === "PENDING";
  const isPaused = props.draftStatus === "PAUSED";
  const isCompleted = props.draftStatus === "COMPLETED";

  const countdownActive = Boolean(
    props.isTimerDraft &&
      props.draftStatus === "IN_PROGRESS" &&
      !props.isFinalResults &&
      props.isMyTurn &&
      isCountdownActive(props.timerRemainingMs)
  );
  const [countdownPhase, setCountdownPhase] = useState<"gold" | "red" | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const audioControllerRef = useRef(props.audioController);

  useEffect(() => {
    audioControllerRef.current = props.audioController;
  }, [props.audioController]);

  useEffect(() => {
    if (!countdownActive) {
      if (countdownIntervalRef.current) {
        window.clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      setCountdownPhase(null);
      return;
    }

    const tick = () => {
      setCountdownPhase((prev) => (prev === "red" ? "gold" : "red"));
      if (props.audioUnlocked) playCountdownBeep(audioControllerRef.current);
    };

    tick();
    countdownIntervalRef.current = window.setInterval(tick, COUNTDOWN_BEEP_INTERVAL_MS);
    return () => {
      if (countdownIntervalRef.current) {
        window.clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [countdownActive, props.audioUnlocked]);

  const centerText =
    props.isFinalResults && props.resultsWinnerLabel
      ? props.resultsWinnerLabel
      : isCompleted
        ? "Draft complete"
        : isPaused
          ? "Paused"
          : isPre
            ? "Not started"
            : props.isTimerDraft
              ? props.clockText
              : (props.participants.find((p) => p.active)?.label ?? "—");

  const canShowRosterLink = props.canToggleView;

  return (
    <Box className="dr-header dr-mobileHeader">
      <Box
        className={[
          "dr-mobileBar",
          countdownActive ? "is-countdown" : "",
          countdownActive ? (countdownPhase === "red" ? "pulse-red" : "pulse-gold") : ""
        ].join(" ")}
        role="banner"
      >
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

        <Box className="drm-miniStat" aria-label="Round">
          <Text className="drm-miniLabel">Round</Text>
          <Text className="drm-miniNumber">{isCompleted ? "—" : (props.roundNumber ?? "—")}</Text>
        </Box>

        <Box className="drm-clock" aria-label="Timer">
          <Text className="drm-clockText" lineClamp={1}>
            {centerText}
          </Text>
        </Box>

        <Box className="drm-miniStat" aria-label="Pick">
          <Text className="drm-miniLabel">Pick</Text>
          <Text className="drm-miniNumber">{isCompleted ? "—" : (props.pickNumber ?? "—")}</Text>
        </Box>

        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon variant="subtle" aria-label="Settings" className="dr-mobileIconBtn">
              <Text component="span" className="mi-icon" aria-hidden="true">
                settings
              </Text>
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={
                <Text component="span" className="gicon" aria-hidden="true">
                  {props.themeIcon}
                </Text>
              }
              onClick={props.onToggleTheme}
            >
              Toggle theme
            </Menu.Item>
            {props.showDraftedVisible ? (
              <Menu.Item closeMenuOnClick={false}>
                <Group justify="space-between" wrap="nowrap" gap="md">
                  <Text>Show drafted</Text>
                  <Switch
                    size="sm"
                    checked={props.showDrafted}
                    onChange={(e) => props.onToggleShowDrafted(e.currentTarget.checked)}
                  />
                </Group>
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
      </Box>

      <Drawer opened={props.open} onClose={props.onClose} title=" " position="left">
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
                    <Text component="span" className="mi-icon mi-icon-tiny" aria-hidden="true">
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
