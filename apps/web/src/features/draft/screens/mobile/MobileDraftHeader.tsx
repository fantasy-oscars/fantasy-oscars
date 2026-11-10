import { ActionIcon, Box, Button, Drawer, Group, Menu, Stack, Switch, Text } from "@ui";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimalAvatarIcon } from "@/shared/animalAvatarIcon";
import type { createDraftAudioController } from "@/lib/draftAudio";
import { formatCountdownText, isCountdownActive } from "@/lib/draftCountdown";
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
  resultsWinnerLabel: string | null;
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

  const countdownActive = Boolean(
    props.isTimerDraft &&
    props.draftStatus === "IN_PROGRESS" &&
    !props.isFinalResults &&
    props.isMyTurn &&
    isCountdownActive(props.timerRemainingMs)
  );
  const [podiumCycleTick, setPodiumCycleTick] = useState(0);
  const countdownPhase = useCountdownPhase({
    active: countdownActive,
    canBeep: props.audioUnlocked,
    audioController: props.audioController
  });

  const podiumPositions = props.resultsPodium
    .map((p) => ({
      place: p.place,
      names: p.names.map((name) => name.trim()).filter((name) => name.length > 0)
    }))
    .filter((p) => p.names.length > 0)
    .sort((a, b) => a.place - b.place)
    .slice(0, 3);
  const hasTiedPodiumPosition = podiumPositions.some((p) => p.names.length > 1);
  const showMobilePodium = props.isFinalResults && podiumPositions.length > 0;
  const podiumSignature = podiumPositions
    .map((p) => `${p.place}:${p.names.join("|")}`)
    .join("||");

  useEffect(() => {
    setPodiumCycleTick(0);
  }, [podiumSignature]);

  useEffect(() => {
    if (!showMobilePodium || !hasTiedPodiumPosition) return;
    const interval = window.setInterval(() => {
      setPodiumCycleTick((prev) => prev + 1);
    }, 1500);
    return () => window.clearInterval(interval);
  }, [hasTiedPodiumPosition, showMobilePodium]);

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
              ? countdownActive
                ? formatCountdownText(props.timerRemainingMs ?? 0)
                : props.clockText
              : (props.participants.find((p) => p.active)?.label ?? "—");

  const centerGlyph = countdownActive ? "timer" : isPaused ? "pause" : null;

  const canShowRosterLink = props.canToggleView;
  // The Settings menu holds only these two items; with neither, it would open empty.
  const showSettings =
    props.showDraftedVisible || (props.showDraftControls && props.canManageDraft);

  return (
    <Box
      component="header"
      className={[
        "dr-header",
        "dr-mobileHeader",
        showMobilePodium ? "is-podium" : "",
        isPaused ? "is-paused" : ""
      ].join(" ")}
    >
      <Box
        className={[
          "dr-mobileBar",
          countdownActive ? "is-countdown" : "",
          countdownActive ? (countdownPhase === "red" ? "pulse-red" : "pulse-gold") : ""
        ].join(" ")}
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
          <Text className="drm-miniNumber">
            {isCompleted ? "—" : (props.roundNumber ?? "—")}
          </Text>
        </Box>

        <Box className="drm-clock" aria-label="Timer">
          {centerGlyph ? (
            <Text component="span" className="mi-icon drm-clockGlyph" aria-hidden="true">
              {centerGlyph}
            </Text>
          ) : null}
          <Text className="drm-clockText" lineClamp={1}>
            {centerText}
          </Text>
        </Box>

        <Box className="drm-miniStat" aria-label="Pick">
          <Text className="drm-miniLabel">Pick</Text>
          <Text className="drm-miniNumber">
            {isCompleted ? "—" : (props.pickNumber ?? "—")}
          </Text>
        </Box>

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

      {showMobilePodium ? (
        <Stack className="drm-podiumStack" gap="var(--fo-space-4)">
          {podiumPositions.map((p) => {
            const currentName =
              p.names.length > 1
                ? (p.names[podiumCycleTick % p.names.length] ?? p.names[0])
                : p.names[0];
            return (
              <Box
                key={`mobile-podium-${p.place}`}
                className={[
                  "drm-podiumBar",
                  p.place === 1 ? "is-gold" : p.place === 2 ? "is-silver" : "is-bronze"
                ].join(" ")}
              >
                <Text
                  key={`mobile-podium-text-${p.place}-${podiumCycleTick % p.names.length}`}
                  className={[
                    "drm-podiumText",
                    p.names.length > 1 ? "is-rolling" : ""
                  ].join(" ")}
                  lineClamp={1}
                  title={currentName}
                >
                  {currentName}
                </Text>
              </Box>
            );
          })}
        </Stack>
      ) : null}

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
