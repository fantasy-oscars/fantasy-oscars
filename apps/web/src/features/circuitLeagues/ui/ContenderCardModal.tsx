import { ActionIcon, Box, Button, Modal, Stack, Text } from "@ui";
import type { ReactNode } from "react";
import type { CircuitDraftedBy } from "@/decisions/circuitDraftRoom";
import type { ContenderTooltip } from "@/decisions/contenderPill";
import type { CircuitPointsSection } from "@/decisions/circuitPoints";
import { NomineeTooltipCard } from "@/shared/nominee/NomineeTooltipCard";
import { FO_MODAL_OVERLAY_OPACITY } from "@/tokens/overlays";

/** A contender's nominee card: the drafted chip and points section where the context has them. */
export function ContenderNomineeCard(props: {
  tooltip: ContenderTooltip;
  drafted?: CircuitDraftedBy | null;
  pointsSection?: CircuitPointsSection | null;
  action?: ReactNode;
}) {
  const { tooltip, drafted } = props;
  return (
    <NomineeTooltipCard
      unitKind={tooltip.unitKind}
      categoryName={tooltip.categoryName}
      filmTitle={tooltip.filmTitle}
      filmYear={tooltip.filmYear}
      filmPosterUrl={tooltip.filmPosterUrl}
      performerName={tooltip.performerName}
      performerProfileUrl={tooltip.performerProfileUrl}
      draftedByLabel={drafted?.username ?? null}
      draftedByAvatarKey={drafted?.avatarKey ?? null}
      draftedRoundPick={drafted?.roundPick ?? null}
      pointsSection={props.pointsSection ?? null}
      action={props.action}
    />
  );
}

export type ContenderCardAction = {
  key: string;
  label: string;
  /** The context's main action (Draft): filled. */
  primary?: boolean;
  /** A destructive action (Drop): the danger variant. */
  danger?: boolean;
  onClick: () => void;
};

export type ContenderCardContent = {
  tooltip: ContenderTooltip;
  drafted?: CircuitDraftedBy | null;
  pointsSection?: CircuitPointsSection | null;
  actions: ContenderCardAction[];
};

/**
 * The ceremony's phone nominee card for a season pill: a centred modal with
 * a visually hidden title, a Close button, the card and the context's
 * actions as full-width buttons. Escape and Close return focus to the pill.
 */
export function ContenderCardModal(props: {
  card: ContenderCardContent | null;
  onClose: () => void;
}) {
  const { card } = props;
  return (
    <Modal
      opened={card !== null}
      onClose={props.onClose}
      centered
      withCloseButton={false}
      title="Nominee details"
      classNames={{
        title: "fo-visuallyHidden",
        header: "fo-modalHeaderCollapsed",
        content: "fo-nomineeModalContent"
      }}
      trapFocus
      returnFocus
      overlayProps={{ opacity: FO_MODAL_OVERLAY_OPACITY }}
    >
      <Box pos="relative">
        <Box
          pos="absolute"
          top="var(--fo-space-4)"
          right="var(--fo-space-4)"
          className="fo-z2"
        >
          <ActionIcon
            variant="subtle"
            className="fo-cardClose"
            onClick={props.onClose}
            aria-label="Close"
          >
            <Text component="span" className="mi-icon mi-icon-tiny" aria-hidden="true">
              close
            </Text>
          </ActionIcon>
        </Box>
        {card ? (
          <ContenderNomineeCard
            tooltip={card.tooltip}
            drafted={card.drafted}
            pointsSection={card.pointsSection}
            action={
              card.actions.length > 0 ? (
                <Stack gap="var(--fo-space-8)" className="fo-cardActions">
                  {card.actions.map((action) => (
                    <Button
                      key={action.key}
                      variant={
                        action.primary ? "filled" : action.danger ? "danger" : "default"
                      }
                      fullWidth
                      onClick={action.onClick}
                    >
                      {action.label}
                    </Button>
                  ))}
                </Stack>
              ) : null
            }
          />
        ) : null}
      </Box>
    </Modal>
  );
}
