import { Box, Checkbox, Select, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import type { DraftRoomOrchestration } from "../../orchestration/draft";
import { NomineeTooltipCard } from "../../components/draft/NomineeTooltipCard";
import { pickDeterministicAvatarKey } from "../../decisions/avatars";
import { computeMasonry, estimateCategoryCardHeightPx } from "../../decisions/draftRoomLayout";
import { pickDraftDivisor } from "../../decisions/draftRoomUnits";
import { AnimalAvatarIcon } from "../animalAvatarIcon";
import { DraftCategoryIcon } from "./DraftCategoryIcon";
import { CategoryCard } from "./CategoryCard";
import { NOMINEE_CARD_TOOLTIP_STYLES, NOMINEE_TOOLTIP_EVENTS } from "./nomineeTooltip";

export function DraftRoomScaffold(props: {
  categories: Array<{
    id: string;
    title: string;
    icon: string;
    iconVariant: "default" | "inverted";
    unitKind: string;
    weight: number | null;
    nominees: Array<{
      id: string;
      label: string;
      muted: boolean;
      winner: boolean;
      posterUrl: string | null;
      filmTitle: string | null;
      filmYear: number | null;
      contributors: string[];
      songTitle: string | null;
      performerName: string | null;
      performerCharacter: string | null;
      performerProfileUrl: string | null;
      performerProfilePath: string | null;
    }>;
  }>;
  draftStatus: string | null;
  hideEmptyCategories: boolean;
  ledgerRows: DraftRoomOrchestration["ledger"]["rows"];
  myPicks: DraftRoomOrchestration["myRoster"]["picks"];
  avatarKeyBySeat: Map<number, string | null>;
  nomineeById: Map<
    number,
    {
      unitKind: string;
      categoryName: string;
      filmTitle: string | null;
      filmYear: number | null;
      filmPosterUrl: string | null;
      contributors: string[];
      performerName: string | null;
      performerCharacter: string | null;
      performerProfileUrl: string | null;
      performerProfilePath: string | null;
      songTitle: string | null;
      categoryIcon: string;
      categoryIconVariant: "default" | "inverted";
    }
  >;
  autodraft: DraftRoomOrchestration["autodraft"];
  draftedNominationIds: Set<number>;
  canDraftAction: boolean;
  onNomineeClick: (nominationId: number, label: string) => void;
  onNomineeDoubleClick: (nominationId: number) => void;
}) {
  const isPre = props.draftStatus === "PENDING";
  const isLiveOrPaused =
    props.draftStatus === "IN_PROGRESS" || props.draftStatus === "PAUSED";

  // A11y: tab order defaults to category headers; entering a category makes its pills tabbable.
  const [keyboardCategoryId, setKeyboardCategoryId] = useState<string | null>(null);

  const [viewportWidthPx, setViewportWidthPx] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 0
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    let raf: number | null = null;
    const onResize = () => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        setViewportWidthPx(window.innerWidth);
        raf = null;
      });
    };
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const unitDivisor = useMemo(() => pickDraftDivisor(viewportWidthPx), [viewportWidthPx]);

  const [ledgerOpen, setLedgerOpen] = useState(!isPre);
  const [myRosterOpen, setMyRosterOpen] = useState(!isPre);
  const [autoDraftOpen, setAutoDraftOpen] = useState(true);

  // Stopgap: narrow desktop keeps board visible but prevents "all rails open" squeeze.
  // (Mobile uses a separate layout path.)
  const compactRails = viewportWidthPx > 0 && viewportWidthPx < 665;

  const openRailExclusive = (rail: "ledger" | "roster" | "auto") => {
    if (!compactRails) return;
    setLedgerOpen(rail === "ledger");
    setMyRosterOpen(rail === "roster");
    setAutoDraftOpen(rail === "auto");
  };

  useEffect(() => {
    if (isPre) {
      setLedgerOpen(false);
      setMyRosterOpen(false);
      setAutoDraftOpen(true);
      return;
    }
    if (isLiveOrPaused) {
      // Leave user toggles as-is once the draft is live/paused.
      return;
    }
  }, [isLiveOrPaused, isPre]);

  useEffect(() => {
    if (!compactRails) return;
    // Enforce mutual exclusivity if we enter compact mode with multiple rails open.
    const openCount =
      (ledgerOpen ? 1 : 0) + (myRosterOpen ? 1 : 0) + (autoDraftOpen ? 1 : 0);
    if (openCount <= 1) return;
    // Prefer the most recently-relevant rail: auto-draft pre-draft, otherwise roster.
    if (isPre) openRailExclusive("auto");
    else openRailExclusive(myRosterOpen ? "roster" : ledgerOpen ? "ledger" : "auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compactRails]);

  const expandedCount =
    (ledgerOpen ? 1 : 0) + (myRosterOpen ? 1 : 0) + (autoDraftOpen ? 1 : 0);
  const midColsMax = Math.max(1, Math.round(unitDivisor - 0.75)); // 0.75 = 3 collapsed rails
  const midCols = Math.max(1, midColsMax - expandedCount);

  const categoriesForBoxes = props.hideEmptyCategories
    ? props.categories.filter((c) => c.nominees.length > 0)
    : props.categories;

  const boxes = categoriesForBoxes.map((c) => ({
    id: c.id,
    title: c.title,
    icon: c.icon,
    iconVariant: c.iconVariant,
    unitKind: c.unitKind,
    weight: c.weight,
    nominees: c.nominees,
    // Use a deterministic estimate for masonry placement; the actual card height
    // is content-driven and hugs the pills.
    estimatePx: estimateCategoryCardHeightPx(c.nominees.length)
  }));
  const masonry = computeMasonry(midCols, boxes);

  return (
    <Box
      className="dr-layout"
      style={{
        ["--d" as never]: unitDivisor,
        ["--rail-ledger" as never]: ledgerOpen ? 1.25 : 0.25,
        ["--rail-roster" as never]: myRosterOpen ? 1.25 : 0.25,
        ["--rail-auto" as never]: autoDraftOpen ? 1.25 : 0.25,
        ["--mid-cols" as never]: midCols
      }}
    >
      <Box
        className={[
          "dr-rail",
          "dr-rail-ledger",
          ledgerOpen ? "is-open" : "is-collapsed"
        ].join(" ")}
      >
        {ledgerOpen ? (
          <Box className="dr-railPane">
            <Box className="dr-railPaneHeader">
              <Box className="dr-railPaneTitleRow">
                <Text
                  component="span"
                  className="mi-icon mi-icon-tiny"
                  aria-hidden="true"
                >
                  history
                </Text>
                <Text className="dr-railPaneTitle">Draft History</Text>
              </Box>
              <UnstyledButton
                type="button"
                className="dr-railClose"
                aria-label="Collapse draft history"
                onClick={() => setLedgerOpen(false)}
              >
                <Text
                  component="span"
                  className="mi-icon mi-icon-tiny"
                  aria-hidden="true"
                >
                  chevron_left
                </Text>
              </UnstyledButton>
            </Box>
            <Box
              className="dr-railPaneBody"
              role="region"
              aria-label="Draft history"
              tabIndex={0}
            >
              <Box className="dr-railList">
                {props.ledgerRows.map((r) => {
                  const nominee = r.nominationId
                    ? (props.nomineeById.get(r.nominationId) ?? null)
                    : null;
                  const avatarKey =
                    r.seatNumber !== null
                      ? (props.avatarKeyBySeat.get(r.seatNumber) ??
                        pickDeterministicAvatarKey(r.seatLabel))
                      : null;
                  const pill = (
                    <Box
                      className={[
                        "dr-pill",
                        "dr-pill-static",
                        r.label === "—" ? "is-muted" : "",
                        r.winner ? "is-winner" : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      tabIndex={nominee ? 0 : undefined}
                      role={nominee ? "group" : undefined}
                      aria-label={
                        nominee ? `${nominee.categoryName}: ${r.label}` : undefined
                      }
                    >
                      {nominee ? (
                        <DraftCategoryIcon
                          icon={nominee.categoryIcon}
                          variant={nominee.categoryIconVariant}
                          className="dr-pill-icon"
                        />
                      ) : r.icon ? (
                        <DraftCategoryIcon
                          icon={r.icon}
                          variant="default"
                          className="dr-pill-icon"
                        />
                      ) : null}
                      <Text component="span" className="dr-pill-text" lineClamp={1}>
                        {r.label}
                      </Text>
                    </Box>
                  );

                  return (
                    <Box
                      key={r.pickNumber}
                      className="dr-railRow dr-ledgerRow"
                      data-active={r.active ? "true" : "false"}
                    >
                      <Text className="dr-railMeta">{r.roundPick}</Text>
                      <Box className="dr-railAvatar">
                        <AnimalAvatarIcon avatarKey={avatarKey} size={22} />
                      </Box>
                      {nominee ? (
                        <Tooltip
                          events={NOMINEE_TOOLTIP_EVENTS}
                          withArrow={false}
                          position="bottom-start"
                          multiline
                          offset={10}
                          styles={NOMINEE_CARD_TOOLTIP_STYLES}
                          label={
                            <NomineeTooltipCard
                              unitKind={nominee.unitKind}
                              categoryName={nominee.categoryName}
                              filmTitle={nominee.filmTitle}
                              filmYear={nominee.filmYear}
                              filmPosterUrl={nominee.filmPosterUrl}
                              contributors={nominee.contributors}
                              performerName={nominee.performerName}
                              performerCharacter={nominee.performerCharacter}
                              performerProfileUrl={nominee.performerProfileUrl}
                              performerProfilePath={nominee.performerProfilePath}
                              songTitle={nominee.songTitle}
                            />
                          }
                        >
                          {pill}
                        </Tooltip>
                      ) : (
                        pill
                      )}
                    </Box>
                  );
                })}
              </Box>
            </Box>
          </Box>
        ) : (
          <UnstyledButton
            type="button"
            className="dr-railToggle"
            aria-label="Expand draft history"
            onClick={() => {
              if (isPre) return;
              if (compactRails) openRailExclusive("ledger");
              else setLedgerOpen(true);
            }}
          >
            <Text component="span" className="mi-icon dr-railStubIcon" aria-hidden="true">
              history
            </Text>
          </UnstyledButton>
        )}
      </Box>

      <Box className="dr-middle" role="region" aria-label="Draft board" tabIndex={0}>
        <Box className="dr-middle-columns" aria-hidden="true">
          {Array.from({ length: midCols }, (_, idx) => (
            <Box key={`mid-col-${idx}`} className="dr-mid-col" />
          ))}
        </Box>

        <Box className="dr-masonry">
          {masonry.map((col, colIdx) => (
            <Box key={`col-${colIdx}`} className="dr-masonry-col">
              {col.map((b) => (
                <CategoryCard
                  key={b.id}
                  categoryId={b.id}
                  title={b.title}
                  icon={b.icon}
                  iconVariant={b.iconVariant}
                  unitKind={b.unitKind}
                  weight={b.weight}
                  nominees={b.nominees}
                  isKeyboardMode={keyboardCategoryId === b.id}
                  setKeyboardMode={setKeyboardCategoryId}
                  canDraftAction={props.canDraftAction}
                  onNomineeClick={props.onNomineeClick}
                  onNomineeDoubleClick={props.onNomineeDoubleClick}
                />
              ))}
            </Box>
          ))}
        </Box>
      </Box>

      <Box
        className={[
          "dr-rail",
          "dr-rail-roster",
          myRosterOpen ? "is-open" : "is-collapsed"
        ].join(" ")}
      >
        {myRosterOpen ? (
          <Box className="dr-railPane">
            <Box className="dr-railPaneHeader">
              <Box className="dr-railPaneTitleRow">
                <Text
                  component="span"
                  className="mi-icon mi-icon-tiny"
                  aria-hidden="true"
                >
                  patient_list
                </Text>
                <Text className="dr-railPaneTitle">My roster</Text>
              </Box>
              <UnstyledButton
                type="button"
                className="dr-railClose"
                aria-label="Collapse my roster"
                onClick={() => setMyRosterOpen(false)}
              >
                <Text
                  component="span"
                  className="mi-icon mi-icon-tiny"
                  aria-hidden="true"
                >
                  chevron_right
                </Text>
              </UnstyledButton>
            </Box>
            <Box
              className="dr-railPaneBody"
              role="region"
              aria-label="My roster"
              tabIndex={0}
            >
              <Box className="dr-railList">
                {props.myPicks.length === 0 ? (
                  <Text className="dr-railEmpty">No picks yet</Text>
                ) : (
                  props.myPicks.map((p) => {
                    const nominee = props.nomineeById.get(p.nominationId) ?? null;
                    const pill = (
                      <Box
                        className={[
                          "dr-pill",
                          "dr-pill-static",
                          p.winner ? "is-winner" : ""
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        tabIndex={nominee ? 0 : undefined}
                        role={nominee ? "group" : undefined}
                        aria-label={
                          nominee ? `${nominee.categoryName}: ${p.label}` : undefined
                        }
                      >
                        {nominee ? (
                          <DraftCategoryIcon
                            icon={nominee.categoryIcon}
                            variant={nominee.categoryIconVariant}
                            className="dr-pill-icon"
                          />
                        ) : p.icon ? (
                          <DraftCategoryIcon
                            icon={p.icon}
                            variant="default"
                            className="dr-pill-icon"
                          />
                        ) : null}
                        <Text component="span" className="dr-pill-text" lineClamp={1}>
                          {p.label}
                        </Text>
                      </Box>
                    );
                    return (
                      <Box key={p.pickNumber} className="dr-railRow dr-rosterRow">
                        <Text className="dr-railMeta">{p.roundPick}</Text>
                        {nominee ? (
                          <Tooltip
                            events={NOMINEE_TOOLTIP_EVENTS}
                            withArrow={false}
                            position="bottom-start"
                            multiline
                            offset={10}
                            styles={NOMINEE_CARD_TOOLTIP_STYLES}
                            label={
                              <NomineeTooltipCard
                                unitKind={nominee.unitKind}
                                categoryName={nominee.categoryName}
                                filmTitle={nominee.filmTitle}
                                filmYear={nominee.filmYear}
                                filmPosterUrl={nominee.filmPosterUrl}
                                contributors={nominee.contributors}
                                performerName={nominee.performerName}
                                performerCharacter={nominee.performerCharacter}
                                performerProfileUrl={nominee.performerProfileUrl}
                                performerProfilePath={nominee.performerProfilePath}
                                songTitle={nominee.songTitle}
                              />
                            }
                          >
                            {pill}
                          </Tooltip>
                        ) : (
                          pill
                        )}
                      </Box>
                    );
                  })
                )}
              </Box>
            </Box>
          </Box>
        ) : (
          <UnstyledButton
            type="button"
            className="dr-railToggle"
            aria-label="Expand my roster"
            onClick={() => {
              if (isPre) return;
              if (compactRails) openRailExclusive("roster");
              else setMyRosterOpen(true);
            }}
          >
            <Text component="span" className="mi-icon dr-railStubIcon" aria-hidden="true">
              patient_list
            </Text>
          </UnstyledButton>
        )}
      </Box>

      <Box
        className={[
          "dr-rail",
          "dr-rail-autodraft",
          autoDraftOpen ? "is-open" : "is-collapsed"
        ].join(" ")}
      >
        {autoDraftOpen ? (
          <Box className="dr-railPane">
            <Box className="dr-railPaneHeader">
              <Box className="dr-railPaneTitleRow">
                <Text
                  component="span"
                  className="mi-icon mi-icon-tiny"
                  aria-hidden="true"
                >
                  smart_toy
                </Text>
                <Text className="dr-railPaneTitle">Auto-draft</Text>
              </Box>
              <UnstyledButton
                type="button"
                className="dr-railClose"
                aria-label="Collapse auto-draft"
                onClick={() => setAutoDraftOpen(false)}
              >
                <Text
                  component="span"
                  className="mi-icon mi-icon-tiny"
                  aria-hidden="true"
                >
                  chevron_right
                </Text>
              </UnstyledButton>
            </Box>
            <Box
              className="dr-railPaneBody"
              role="region"
              aria-label="Auto-draft"
              tabIndex={0}
            >
              <Stack gap="sm">
                <Checkbox
                  checked={props.autodraft.enabled}
                  onChange={(e) => props.autodraft.setEnabled(e.currentTarget.checked)}
                  label="Enable auto-drafting"
                />

                <Select
                  label="Strategy"
                  value={props.autodraft.strategy}
                  onChange={(v) =>
                    props.autodraft.setStrategy(
                      (v as
                        | "random"
                        | "by_category"
                        | "alphabetical"
                        | "wisdom"
                        | "custom") ?? "random"
                    )
                  }
                  data={[
                    { value: "random", label: "Random" },
                    { value: "by_category", label: "By category" },
                    { value: "alphabetical", label: "Alphabetical" },
                    { value: "wisdom", label: "Wisdom of crowds" },
                    {
                      value: "custom",
                      label: "Custom",
                      disabled: props.autodraft.plans.length === 0
                    }
                  ]}
                  allowDeselect={false}
                />

                {props.autodraft.strategy === "custom" ? (
                  <Select
                    label="Plan"
                    placeholder={
                      props.autodraft.plans.length === 0
                        ? "No plans available"
                        : "Choose…"
                    }
                    value={
                      props.autodraft.selectedPlanId
                        ? String(props.autodraft.selectedPlanId)
                        : null
                    }
                    onChange={(v) =>
                      props.autodraft.setSelectedPlanId(v ? Number(v) : null)
                    }
                    data={props.autodraft.plans.map((p) => ({
                      value: String(p.id),
                      label: p.name
                    }))}
                    disabled={props.autodraft.plans.length === 0}
                    searchable
                    clearable
                  />
                ) : null}

                {props.autodraft.strategy === "custom" ? (
                  <Box>
                    {props.autodraft.list.length === 0 ? (
                      <Text className="muted">No nominees.</Text>
                    ) : (
                      <Stack gap={6}>
                        {props.autodraft.list.map((item) => {
                          const nominee = props.nomineeById.get(item.nominationId);
                          const isDrafted = props.draftedNominationIds.has(
                            item.nominationId
                          );
                          const pill = (
                            <Box
                              className={[
                                "dr-pill",
                                "dr-pill-static",
                                isDrafted ? "is-muted" : ""
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              tabIndex={nominee ? 0 : undefined}
                              role={nominee ? "group" : undefined}
                              aria-label={
                                nominee
                                  ? `${nominee.categoryName}: ${item.label}`
                                  : undefined
                              }
                            >
                              {nominee ? (
                                <DraftCategoryIcon
                                  icon={nominee.categoryIcon}
                                  variant={nominee.categoryIconVariant}
                                  className="dr-pill-icon"
                                />
                              ) : item.icon ? (
                                <DraftCategoryIcon
                                  icon={item.icon}
                                  variant="default"
                                  className="dr-pill-icon"
                                />
                              ) : null}
                              <Text
                                component="span"
                                className="dr-pill-text"
                                lineClamp={1}
                              >
                                {item.label}
                              </Text>
                            </Box>
                          );
                          return nominee ? (
                            <Tooltip
                              key={item.nominationId}
                              events={NOMINEE_TOOLTIP_EVENTS}
                              withArrow={false}
                              position="bottom-start"
                              multiline
                              offset={10}
                              styles={NOMINEE_CARD_TOOLTIP_STYLES}
                              label={
                                <NomineeTooltipCard
                                  unitKind={nominee.unitKind}
                                  categoryName={nominee.categoryName}
                                  filmTitle={nominee.filmTitle}
                                  filmYear={nominee.filmYear}
                                  filmPosterUrl={nominee.filmPosterUrl}
                                  contributors={nominee.contributors}
                                  performerName={nominee.performerName}
                                  performerCharacter={nominee.performerCharacter}
                                  performerProfileUrl={nominee.performerProfileUrl}
                                  performerProfilePath={nominee.performerProfilePath}
                                  songTitle={nominee.songTitle}
                                />
                              }
                            >
                              {pill}
                            </Tooltip>
                          ) : (
                            <Box key={item.nominationId}>{pill}</Box>
                          );
                        })}
                      </Stack>
                    )}
                  </Box>
                ) : null}
              </Stack>
            </Box>
          </Box>
        ) : (
          <UnstyledButton
            type="button"
            className="dr-railToggle"
            aria-label="Expand auto-draft"
            onClick={() => {
              if (compactRails) openRailExclusive("auto");
              else setAutoDraftOpen(true);
            }}
          >
            <Text component="span" className="mi-icon dr-railStubIcon" aria-hidden="true">
              smart_toy
            </Text>
          </UnstyledButton>
        )}
      </Box>
    </Box>
  );
}
