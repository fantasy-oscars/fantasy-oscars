import { Box, Checkbox, Select, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { NomineeTooltipCard } from "../../components/draft/NomineeTooltipCard";
import { DraftCategoryIcon } from "./DraftCategoryIcon";
import { NOMINEE_CARD_TOOLTIP_STYLES, NOMINEE_TOOLTIP_EVENTS } from "./nomineeTooltip";
import type { AutoDraftState, DraftNomineeMeta } from "./types";

export function DraftAutoDraftRail(props: {
  open: boolean;
  setOpen: (open: boolean) => void;
  compactRails: boolean;
  openRailExclusive: (rail: "ledger" | "roster" | "auto") => void;
  autodraft: AutoDraftState;
  nomineeById: Map<number, DraftNomineeMeta>;
  draftedNominationIds: Set<number>;
}) {
  const { open, setOpen, compactRails, openRailExclusive } = props;

  return (
    <Box className={["dr-rail", "dr-rail-autodraft", open ? "is-open" : "is-collapsed"].join(" ")}>
      {open ? (
        <Box className="dr-railPane">
          <Box className="dr-railPaneHeader">
            <Box className="dr-railPaneTitleRow">
              <Text component="span" className="mi-icon mi-icon-tiny" aria-hidden="true">
                smart_toy
              </Text>
              <Text className="dr-railPaneTitle">Auto-draft</Text>
            </Box>
            <UnstyledButton type="button" className="dr-railClose" aria-label="Collapse auto-draft" onClick={() => setOpen(false)}>
              <Text component="span" className="mi-icon mi-icon-tiny" aria-hidden="true">
                chevron_right
              </Text>
            </UnstyledButton>
          </Box>
          <Box className="dr-railPaneBody" role="region" aria-label="Auto-draft" tabIndex={0}>
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
                    (v as "random" | "by_category" | "alphabetical" | "wisdom" | "custom") ?? "random"
                  )
                }
                data={[
                  { value: "random", label: "Random" },
                  { value: "by_category", label: "By category" },
                  { value: "alphabetical", label: "Alphabetical" },
                  { value: "wisdom", label: "Wisdom of crowds" },
                  { value: "custom", label: "Custom", disabled: props.autodraft.plans.length === 0 }
                ]}
                allowDeselect={false}
              />

              {props.autodraft.strategy === "custom" ? (
                <Select
                  label="Plan"
                  placeholder={props.autodraft.plans.length === 0 ? "No plans available" : "Choose…"}
                  value={props.autodraft.selectedPlanId ? String(props.autodraft.selectedPlanId) : null}
                  onChange={(v) => props.autodraft.setSelectedPlanId(v ? Number(v) : null)}
                  data={props.autodraft.plans.map((p) => ({ value: String(p.id), label: p.name }))}
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
                        const isDrafted = props.draftedNominationIds.has(item.nominationId);
                        const pill = (
                          <Box
                            className={["dr-pill", "dr-pill-static", isDrafted ? "is-muted" : ""].filter(Boolean).join(" ")}
                            tabIndex={nominee ? 0 : undefined}
                            role={nominee ? "group" : undefined}
                            aria-label={nominee ? `${nominee.categoryName}: ${item.label}` : undefined}
                          >
                            {nominee ? (
                              <DraftCategoryIcon icon={nominee.categoryIcon} variant={nominee.categoryIconVariant} className="dr-pill-icon" />
                            ) : item.icon ? (
                              <DraftCategoryIcon icon={item.icon} variant="default" className="dr-pill-icon" />
                            ) : null}
                            <Text component="span" className="dr-pill-text" lineClamp={1}>
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
            else setOpen(true);
          }}
        >
          <Text component="span" className="mi-icon dr-railStubIcon" aria-hidden="true">
            smart_toy
          </Text>
        </UnstyledButton>
      )}
    </Box>
  );
}
