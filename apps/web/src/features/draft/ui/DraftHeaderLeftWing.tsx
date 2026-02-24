import { Box, Button, Drawer, Group, Stack, Text, UnstyledButton } from "@ui";
import type { RefObject } from "react";
import { Link } from "react-router-dom";
import { AnimalAvatarIcon } from "@/shared/animalAvatarIcon";
import { ParticipantStrip } from "./ParticipantStrip";

export function DraftHeaderLeftWing(props: {
  compactHeader: boolean;
  compactMenuOpen: boolean;
  setCompactMenuOpen: (open: boolean) => void;
  backHref: string | null;
  isCompleted: boolean;
  isPre: boolean;
  isPaused: boolean;
  participants: Array<{
    seatNumber: number;
    label: string;
    active: boolean;
    avatarKey: string;
  }>;
  activeIndex: number;
  direction: "FORWARD" | "REVERSE" | null;
  participantStripLayout: {
    containerRef: RefObject<HTMLDivElement | null>;
    capacity: number;
    start: number;
    end: number;
  };
  view: "draft" | "roster";
  onViewChange: (v: "draft" | "roster") => void;
  canToggleView: boolean;
  onParticipantHoverSeat: (seatNumber: number | null) => void;
}) {
  if (props.compactHeader) {
    return (
      <>
        <Box className="drh-backWrap" aria-hidden={false}>
          <UnstyledButton
            type="button"
            className="drh-back"
            aria-label="Menu"
            onClick={() => props.setCompactMenuOpen(true)}
          >
            <Text component="span" className="mi-icon mi-icon-tiny" aria-hidden="true">
              menu
            </Text>
          </UnstyledButton>
        </Box>
        <Drawer
          opened={props.compactMenuOpen}
          onClose={() => props.setCompactMenuOpen(false)}
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
                props.setCompactMenuOpen(false);
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
                props.setCompactMenuOpen(false);
              }}
            >
              {props.view === "draft" ? "Roster view" : "Draft view"}
            </Button>

            {!props.isCompleted ? (
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
            ) : null}
          </Stack>
        </Drawer>
      </>
    );
  }

  return (
    <>
      <Box className="drh-backWrap" aria-hidden={false}>
        <UnstyledButton
          component={Link}
          to={props.backHref ?? "#"}
          className={["drh-back", props.backHref ? "" : "is-disabled"].join(" ")}
          aria-label="Back to season"
          onClick={(e) => {
            if (!props.backHref) e.preventDefault();
          }}
        >
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
          onParticipantHoverSeat={props.onParticipantHoverSeat}
        />
      ) : null}
    </>
  );
}
