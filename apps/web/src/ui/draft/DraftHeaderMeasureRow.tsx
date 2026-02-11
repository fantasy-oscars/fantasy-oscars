import { Box, Button, Group, SegmentedControl, Switch, Text, UnstyledButton } from "@mantine/core";
import type { RefObject } from "react";
import { AnimalAvatarIcon } from "../animalAvatarIcon";
import { ParticipantStrip } from "./ParticipantStrip";

export function DraftHeaderMeasureRow(props: {
  leftMeasureRef: RefObject<HTMLDivElement | null>;
  rightMeasureRef: RefObject<HTMLDivElement | null>;
  participantStripLayout: {
    containerRef: RefObject<HTMLDivElement | null>;
    capacity: number;
    start: number;
    end: number;
  };
  isCompleted: boolean;
  isPre: boolean;
  isPaused: boolean;
  showDraftControls: boolean;
  canManageDraft: boolean;
  participants: Array<{
    seatNumber: number;
    label: string;
    active: boolean;
    avatarKey: string;
  }>;
  activeIndex: number;
  direction: "FORWARD" | "REVERSE" | null;
  view: "draft" | "roster";
  canToggleView: boolean;
  showDraftedVisible: boolean;
  showDrafted: boolean;
  themeIcon: string;
  userLabel: string;
  userAvatarKey: string | null;
}) {
  return (
    <Box className="drh-measure" aria-hidden="true">
      <Box className="drh-measureWing" ref={props.leftMeasureRef}>
        <Box className="drh-backWrap">
          <UnstyledButton className="drh-back" type="button" aria-hidden="true">
            <Text component="span" className="mi-icon mi-icon-tiny" aria-hidden="true">
              arrow_back
            </Text>
          </UnstyledButton>
        </Box>
        {!props.isCompleted ? (
          <ParticipantStrip
            containerRef={props.participantStripLayout.containerRef}
            capacity={props.participantStripLayout.capacity}
            start={props.participantStripLayout.start}
            end={props.participantStripLayout.end}
            participants={props.participants}
            activeIndex={props.activeIndex}
            direction={props.direction}
            suppressActive={props.isPre || props.isPaused || props.isCompleted}
          />
        ) : null}
      </Box>

      <Box className="drh-measureWing drh-measureWingRight" ref={props.rightMeasureRef}>
        {props.showDraftControls && props.canManageDraft ? (
          <Box className="drh-pauseWrap">
            <UnstyledButton type="button" className="drh-pause" aria-hidden="true">
              <Text component="span" className="mi-icon mi-icon-tiny" aria-hidden="true">
                {props.isPre || props.isPaused ? "play_arrow" : "pause"}
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
                    <Switch size="sm" checked={props.showDrafted} onChange={() => {}} />
                  ) : (
                    <Box className="drh-togglePlaceholder" aria-hidden="true" />
                  )}
                </Box>
              </Group>
            </Box>
          </Box>
        ) : null}

        <Group className="drh-stowaways" gap="xs" wrap="nowrap">
          <Button type="button" variant="subtle" className="theme-toggle" aria-hidden="true">
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
  );
}
