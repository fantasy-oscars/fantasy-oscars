import { Box, Button, Radio, Stack, Text, Title } from "@ui";
import { StandardCard } from "@/primitives";
import {
  NO_SEASON_KIND_NOTE,
  SEASON_KIND_COPY,
  SEASON_KIND_ORDER,
  type SeasonKind,
  type SeasonKindAvailability
} from "@/decisions/seasonKinds";
import classes from "./SeasonCreate.module.css";

const NOTE_ID = "season-kind-none-note";
const nameId = (kind: SeasonKind) => `season-kind-${kind}-name`;
const descriptionId = (kind: SeasonKind) => `season-kind-${kind}-description`;

/** Card 1 of Create season: which kind of season to create. */
export function SeasonKindChoice(props: {
  kinds: Record<SeasonKind, SeasonKindAvailability>;
  selected: SeasonKind | null;
  onChoose: (kind: SeasonKind) => void;
  checkingFull: boolean;
  onRetryFull: () => void;
  disabled?: boolean;
}) {
  const {
    kinds,
    selected,
    onChoose,
    checkingFull,
    onRetryFull,
    disabled = false
  } = props;
  const unavailable = SEASON_KIND_ORDER.filter((k) => !kinds[k].available);
  const noneAvailable = unavailable.length === SEASON_KIND_ORDER.length;
  // Disabled radios are skipped by the arrow keys, so the group itself carries the reasons.
  const describedBy = [
    ...unavailable.map(descriptionId),
    ...(noneAvailable ? [NOTE_ID] : [])
  ].join(" ");

  return (
    <StandardCard>
      <Stack
        gap="sm"
        component="fieldset"
        className={classes.fieldset}
        aria-describedby={describedBy || undefined}
      >
        <Title component="legend" order={3} variant="section">
          Kind of season
        </Title>
        <Radio.Group
          name="season-kind"
          value={selected ?? ""}
          onChange={(v) => {
            if (v === "ceremony" || v === "full") onChoose(v);
          }}
        >
          <Stack gap="sm">
            {SEASON_KIND_ORDER.map((kind) => {
              const availability = kinds[kind];
              const copy = SEASON_KIND_COPY[kind];
              return (
                <Box key={kind}>
                  <Radio
                    value={kind}
                    disabled={disabled || !availability.available}
                    aria-labelledby={nameId(kind)}
                    aria-describedby={descriptionId(kind)}
                    label={
                      <>
                        <span id={nameId(kind)} className={classes.kindName}>
                          {copy.name}
                        </span>
                        <span
                          id={descriptionId(kind)}
                          className={classes.kindDescription}
                        >
                          {availability.available
                            ? copy.description
                            : availability.reason}
                        </span>
                      </>
                    }
                  />
                  {!availability.available && availability.retry ? (
                    <Box className={classes.optionAction} mt="var(--fo-space-dense-2)">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={onRetryFull}
                        loading={checkingFull}
                      >
                        Try again
                      </Button>
                    </Box>
                  ) : null}
                </Box>
              );
            })}
          </Stack>
        </Radio.Group>
        {noneAvailable ? (
          <Text id={NOTE_ID} variant="meta">
            {NO_SEASON_KIND_NOTE}
          </Text>
        ) : null}
      </Stack>
    </StandardCard>
  );
}
