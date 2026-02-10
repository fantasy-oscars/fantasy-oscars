import { Box, Button, Drawer, Group, Menu, SegmentedControl, Stack, Switch, Text, UnstyledButton } from "@mantine/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimalAvatarIcon } from "../animalAvatarIcon";
import { CenterBuckle } from "./CenterBuckle";
import { ParticipantStrip } from "./ParticipantStrip";
import { createDraftAudioController, playCountdownBeep } from "../../lib/draftAudio";
import { COUNTDOWN_BEEP_INTERVAL_MS, isCountdownActive } from "../../lib/draftCountdown";

export function DraftBoardHeader(props: {
  backHref: string | null;
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
  showDraftControls: boolean;
  canManageDraft: boolean;
  onStartDraft: () => void;
  onPauseDraft: () => void;
  onResumeDraft: () => void;
  audioController: ReturnType<typeof createDraftAudioController>;
  audioUnlocked: boolean;
  isMyTurn: boolean;
  userLabel: string;
  userAvatarKey: string | null;
}) {
  const isPre = props.draftStatus === "PENDING";
  const isPaused = props.draftStatus === "PAUSED";
  const isCompleted = props.draftStatus === "COMPLETED";

  const headerRef = useRef<HTMLDivElement | null>(null);
  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);
  const leftWingRef = useRef<HTMLDivElement | null>(null);
  const rightWingRef = useRef<HTMLDivElement | null>(null);
  const leftMeasureRef = useRef<HTMLDivElement | null>(null);
  const rightMeasureRef = useRef<HTMLDivElement | null>(null);
  const buckleRef = useRef<HTMLDivElement | null>(null);
  const [compactHeader, setCompactHeader] = useState(false);
  const [compactMenuOpen, setCompactMenuOpen] = useState(false);
  const nonCompactNeededWidthRef = useRef<number>(0);

  const activeIndexRaw = props.participants.findIndex((p) => p.active);
  const activeIndex = activeIndexRaw >= 0 ? activeIndexRaw : 0;
  const activeLabel = props.participants[activeIndex]?.label ?? "—";
  const centerText = (() => {
    if (props.isFinalResults) {
      const raw = props.resultsWinnerLabel?.trim();
      if (!raw) return "Draft complete";
      return raw.startsWith("Tie:") ? raw : `Winner: ${raw}`;
    }
    if (isPaused) return "Paused";
    if (isPre) return "Not started";
    if (isCompleted) return "Draft complete";
    return props.isTimerDraft ? props.clockText : activeLabel;
  })();

  const countdownActive = Boolean(
    props.isTimerDraft &&
    props.draftStatus === "IN_PROGRESS" &&
    !props.isFinalResults &&
    isCountdownActive(props.timerRemainingMs) &&
    // Only the active drafter gets urgency feedback (audio + flashing).
    props.isMyTurn
  );

  const [countdownPhase, setCountdownPhase] = useState<"gold" | "red" | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const canBeepRef = useRef(false);

  useEffect(() => {
    canBeepRef.current = Boolean(props.audioUnlocked && props.isMyTurn);
  }, [props.audioUnlocked, props.isMyTurn]);

  useEffect(() => {
    if (!countdownActive) {
      if (countdownIntervalRef.current) {
        window.clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      setCountdownPhase(null);
      return;
    }

    // Start immediately when countdown begins.
    const tick = () => {
      setCountdownPhase((prev) => (prev === "red" ? "gold" : "red"));
      if (canBeepRef.current) playCountdownBeep(props.audioController);
    };

    tick();
    countdownIntervalRef.current = window.setInterval(tick, COUNTDOWN_BEEP_INTERVAL_MS);

    return () => {
      if (countdownIntervalRef.current) {
        window.clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdownActive]);

  const buckleMaxPx = useMemo(() => {
    // Defensive default: ~25% of viewport, clamped.
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    return Math.min(360, Math.max(200, Math.floor(vw * 0.25)));
  }, []);

  useEffect(() => {
    const headerEl = headerRef.current;
    if (!headerEl) return;

    const compute = () => {
      const headerRect = headerEl.getBoundingClientRect();
      const l = leftMeasureRef.current?.getBoundingClientRect();
      const r = rightMeasureRef.current?.getBoundingClientRect();
      const b = buckleRef.current?.getBoundingClientRect();
      if (!l || !r || !b) return;

      // Use a width-based model instead of bounding-box overlap. The buckle is centered,
      // so each "wing" must fit inside its half of the header.
      const headerPad = 28; // .drh-row has padding: 0 14px
      const available = Math.max(0, headerRect.width - headerPad);
      const half = available / 2;
      const buckleHalf = b.width / 2;
      const leftW = l.width;
      const rightW = r.width;

      setCompactHeader((prev) => {
        const enterPad = 10;
        const exitPad = 22; // hysteresis to prevent flip-flop near the threshold
        const limit = half - buckleHalf - (prev ? exitPad : enterPad);
        const needsCompact = leftW > limit || rightW > limit;
        if (!prev) {
          nonCompactNeededWidthRef.current = Math.ceil(leftW + rightW + b.width + 72);
          return needsCompact;
        }
        // When compact, require more headroom before switching back.
        const hasRoom = !needsCompact;
        return hasRoom ? false : true;
      });
    };

    compute();
    const ro = new ResizeObserver(() => requestAnimationFrame(compute));
    ro.observe(headerEl);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    // Recompute when content changes even if the header size doesn't (e.g. split-screen).
    requestAnimationFrame(() => {
      const headerEl = headerRef.current;
      if (!headerEl) return;
      const headerRect = headerEl.getBoundingClientRect();
      const l = leftMeasureRef.current?.getBoundingClientRect();
      const r = rightMeasureRef.current?.getBoundingClientRect();
      const b = buckleRef.current?.getBoundingClientRect();
      if (!l || !r || !b) return;
      setCompactHeader((prev) => {
        const headerPad = 28;
        const available = Math.max(0, headerRect.width - headerPad);
        const half = available / 2;
        const buckleHalf = b.width / 2;
        const enterPad = 10;
        const exitPad = 22;
        const limit = half - buckleHalf - (prev ? exitPad : enterPad);
        const needsCompact = l.width > limit || r.width > limit;
        if (!prev) {
          nonCompactNeededWidthRef.current = Math.ceil(l.width + r.width + b.width + 72);
          return needsCompact;
        }
        return needsCompact ? true : false;
      });
    });
  }, [
    centerText,
    props.participants,
    props.userLabel,
    props.showDraftControls,
    props.showDraftedVisible,
    props.view,
    props.canToggleView
  ]);

  return (
    <Box className="dr-header">
      <Box className="drh-row" ref={headerRef}>
        <Box className="drh-left" ref={leftRef}>
          <Box className="drh-wing" ref={leftWingRef}>
            {compactHeader ? (
              <>
                <Box className="drh-backWrap" aria-hidden={false}>
                  <UnstyledButton
                    type="button"
                    className="drh-back"
                    aria-label="Menu"
                    onClick={() => setCompactMenuOpen(true)}
                  >
                    <Text
                      component="span"
                      className="mi-icon mi-icon-tiny"
                      aria-hidden="true"
                    >
                      menu
                    </Text>
                  </UnstyledButton>
                </Box>
                <Drawer
                  opened={compactMenuOpen}
                  onClose={() => setCompactMenuOpen(false)}
                  position="left"
                  title=" "
                >
                  <Stack gap="md">
                    <Button
                      component={Link}
                      to={props.backHref ?? "/seasons"}
                      variant="outline"
                      fullWidth
                      onClick={(e) => {
                        if (!props.backHref) e.preventDefault();
                        setCompactMenuOpen(false);
                      }}
                    >
                      Back to seasons
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      fullWidth
                      disabled={!props.canToggleView}
                      onClick={() => {
                        if (!props.canToggleView) return;
                        props.onViewChange(props.view === "draft" ? "roster" : "draft");
                        setCompactMenuOpen(false);
                      }}
                    >
                      {props.view === "draft" ? "Roster view" : "Draft view"}
                    </Button>

                    {!isCompleted ? (
                      <Box>
                        <Text className="baseline-textMeta" style={{ marginBottom: 8 }}>
                          Draft order
                        </Text>
                        <Stack gap="xs">
                          {props.participants.map((p) => (
                            <Group
                              key={p.seatNumber}
                              justify="space-between"
                              wrap="nowrap"
                            >
                              <Group gap="sm" wrap="nowrap">
                                <AnimalAvatarIcon avatarKey={p.avatarKey} size={22} />
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
                    ) : null}
                  </Stack>
                </Drawer>
              </>
            ) : (
              <>
                <Box className="drh-backWrap" aria-hidden={false}>
                  <UnstyledButton
                    component={Link}
                    to={props.backHref ?? "#"}
                    className={["drh-back", props.backHref ? "" : "is-disabled"].join(
                      " "
                    )}
                    aria-label="Back to season"
                    onClick={(e) => {
                      if (!props.backHref) e.preventDefault();
                    }}
                  >
                    <Text
                      component="span"
                      className="mi-icon mi-icon-tiny"
                      aria-hidden="true"
                    >
                      arrow_back
                    </Text>
                  </UnstyledButton>
                </Box>
                {!isCompleted && (
                  <ParticipantStrip
                    participants={props.participants}
                    activeIndex={activeIndex}
                    direction={props.direction}
                    suppressActive={isPre || isPaused || isCompleted}
                  />
                )}
              </>
            )}
          </Box>
        </Box>

        <Box className="drh-right" ref={rightRef}>
          <Box className="drh-wing drh-wingRight" ref={rightWingRef}>
            {!compactHeader && props.showDraftControls && props.canManageDraft ? (
              <Box className="drh-pauseWrap">
                <UnstyledButton
                  type="button"
                  className="drh-pause"
                  aria-label={
                    isPre ? "Start draft" : isPaused ? "Resume draft" : "Pause draft"
                  }
                  onClick={() => {
                    if (isPre) props.onStartDraft();
                    else if (isPaused) props.onResumeDraft();
                    else props.onPauseDraft();
                  }}
                >
                  <Text
                    component="span"
                    className="mi-icon mi-icon-tiny"
                    aria-hidden="true"
                  >
                    {isPre || isPaused ? "play_arrow" : "pause"}
                  </Text>
                </UnstyledButton>
              </Box>
            ) : null}

            {!compactHeader && props.showDraftControls ? (
              <Box className="drh-controls">
                <Box className="drh-controlsGrid">
                  <Group className="drh-controlRow" gap="sm" wrap="nowrap">
                    <Text className="drh-label">View</Text>
                    <SegmentedControl
                      size="xs"
                      value={props.view}
                      onChange={(v) => props.onViewChange(v as "draft" | "roster")}
                      data={[
                        { value: "draft", label: "Draft" },
                        { value: "roster", label: "Roster" }
                      ]}
                      disabled={!props.canToggleView}
                    />
                  </Group>

                  <Group className="drh-controlRow" gap="sm" wrap="nowrap">
                    <Text className="drh-label">Show drafted</Text>
                    <Box className="drh-toggleSlot">
                      {props.showDraftedVisible ? (
                        <Switch
                          size="sm"
                          checked={props.showDrafted}
                          onChange={(e) =>
                            props.onToggleShowDrafted(e.currentTarget.checked)
                          }
                        />
                      ) : (
                        <Box className="drh-togglePlaceholder" aria-hidden="true" />
                      )}
                    </Box>
                  </Group>
                </Box>
              </Box>
            ) : null}

            {compactHeader ? (
              <Group className="drh-stowaways" gap="xs" wrap="nowrap">
                <Menu position="bottom-end" withinPortal>
                  <Menu.Target>
                    <Button
                      type="button"
                      variant="subtle"
                      className="theme-toggle"
                      aria-label="Open settings"
                    >
                      <Text
                        component="span"
                        className="mi-icon mi-icon-tiny"
                        aria-hidden="true"
                      >
                        settings
                      </Text>
                    </Button>
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
                            onChange={(e) =>
                              props.onToggleShowDrafted(e.currentTarget.checked)
                            }
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
              </Group>
            ) : (
              <Group className="drh-stowaways" gap="xs" wrap="nowrap">
                <Button
                  type="button"
                  variant="subtle"
                  className="theme-toggle"
                  onClick={props.onToggleTheme}
                  aria-label="Toggle theme"
                >
                  <Text component="span" className="gicon" aria-hidden="true">
                    {props.themeIcon}
                  </Text>
                </Button>
                <Box className="drh-userBadge">
                  <AnimalAvatarIcon avatarKey={props.userAvatarKey} size={24} />
                  <Text className="drh-userText">{props.userLabel}</Text>
                </Box>
              </Group>
            )}
          </Box>
        </Box>

        <Box ref={buckleRef}>
          <CenterBuckle
            roundNumber={isCompleted ? null : props.roundNumber}
            pickNumber={isCompleted ? null : props.pickNumber}
            centerText={centerText}
            className={
              countdownActive
                ? [
                    "is-countdown",
                    countdownPhase === "red" ? "pulse-red" : "pulse-gold"
                  ].join(" ")
                : ""
            }
            measureText={
              props.isTimerDraft
                ? null
                : props.participants.reduce(
                    (longest, p) => (p.label.length > longest.length ? p.label : longest),
                    ""
                  )
            }
            isTimerDraft={props.isTimerDraft}
            maxHandleLengthPx={buckleMaxPx}
          />
        </Box>

        {/* Hidden measurement row: keeps compact/non-compact switching stable by
            measuring the real non-compact wing widths even when compact is active. */}
        <Box className="drh-measure" aria-hidden="true">
          <Box className="drh-measureWing" ref={leftMeasureRef}>
            <Box className="drh-backWrap">
              <UnstyledButton className="drh-back" type="button" aria-hidden="true">
                <Text
                  component="span"
                  className="mi-icon mi-icon-tiny"
                  aria-hidden="true"
                >
                  arrow_back
                </Text>
              </UnstyledButton>
            </Box>
            {!isCompleted ? (
              <ParticipantStrip
                participants={props.participants}
                activeIndex={activeIndex}
                direction={props.direction}
                suppressActive={isPre || isPaused || isCompleted}
              />
            ) : null}
          </Box>

          <Box className="drh-measureWing drh-measureWingRight" ref={rightMeasureRef}>
            {props.showDraftControls && props.canManageDraft ? (
              <Box className="drh-pauseWrap">
                <UnstyledButton type="button" className="drh-pause" aria-hidden="true">
                  <Text
                    component="span"
                    className="mi-icon mi-icon-tiny"
                    aria-hidden="true"
                  >
                    {isPre || isPaused ? "play_arrow" : "pause"}
                  </Text>
                </UnstyledButton>
              </Box>
            ) : null}

            {props.showDraftControls ? (
              <Box className="drh-controls">
                <Box className="drh-controlsGrid">
                  <Group className="drh-controlRow" gap="sm" wrap="nowrap">
                    <Text className="drh-label">View</Text>
                    <SegmentedControl
                      size="xs"
                      value={props.view}
                      onChange={() => {}}
                      data={[
                        { value: "draft", label: "Draft" },
                        { value: "roster", label: "Roster" }
                      ]}
                      disabled={!props.canToggleView}
                    />
                  </Group>

                  <Group className="drh-controlRow" gap="sm" wrap="nowrap">
                    <Text className="drh-label">Show drafted</Text>
                    <Box className="drh-toggleSlot">
                      {props.showDraftedVisible ? (
                        <Switch
                          size="sm"
                          checked={props.showDrafted}
                          onChange={() => {}}
                        />
                      ) : (
                        <Box className="drh-togglePlaceholder" aria-hidden="true" />
                      )}
                    </Box>
                  </Group>
                </Box>
              </Box>
            ) : null}

            <Group className="drh-stowaways" gap="xs" wrap="nowrap">
              <Button
                type="button"
                variant="subtle"
                className="theme-toggle"
                aria-hidden="true"
              >
                <Text component="span" className="gicon" aria-hidden="true">
                  {props.themeIcon}
                </Text>
              </Button>
              <Box className="drh-userBadge">
                <AnimalAvatarIcon avatarKey={props.userAvatarKey} size={24} />
                <Text className="drh-userText">{props.userLabel}</Text>
              </Box>
            </Group>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
