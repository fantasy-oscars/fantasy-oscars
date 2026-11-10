import {
  Box,
  Group,
  MultiSelect,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Title
} from "@ui";
import type { ModePreference, SingleModePolicy } from "@fantasy-oscars/shared/appearance";
import type { BrandId } from "@fantasy-oscars/shared/brands";
import { StandardCard } from "@/primitives";
import { FormStatus } from "@/shared/forms";
import { APPEARANCE_COPY, type AppearanceView } from "@/decisions/appearance";
import type { AppearanceSelection } from "@/decisions/appearance";

const COMBOBOX_PROPS = { withinPortal: true, position: "bottom-start" } as const;
/** Prescription 5.5: a list taller than this scrolls (with its scrollbar showing, so it reads as longer). */
const LIST_MAX_HEIGHT = "min(280px, calc(100vh - 220px))";

/** Props and events only: the view is derived and the writes happen above. */
export function AppearanceSection(props: {
  view: AppearanceView;
  /** "Saving…", "Saved" or empty; the line is always reserved. */
  statusText: string;
  failure: boolean;
  onRetry: () => void;
  /** Stack the segments (a phone width). */
  vertical: boolean;
  onModeChange: (mode: ModePreference) => void;
  onSelectionChange: (selection: AppearanceSelection) => void;
  onFixedChange: (brand: BrandId) => void;
  onRandomChange: (values: string[]) => void;
  onPolicyChange: (policy: SingleModePolicy) => void;
  /** Specimen only: hold the Random list open, in the page flow. */
  listOpen?: boolean;
  /** Element id of the card; the specimen renders several, so each needs its own. */
  idPrefix?: string;
}) {
  const { view, vertical } = props;
  const id = props.idPrefix ?? "appearance";
  const orientation = vertical ? "vertical" : "horizontal";
  const openProps = props.listOpen
    ? {
        dropdownOpened: true,
        // Off-screen cells would otherwise be hidden as detached, and flipped above the field.
        comboboxProps: {
          ...COMBOBOX_PROPS,
          withinPortal: false,
          hideDetached: false,
          middlewares: { flip: false, shift: false }
        }
      }
    : { comboboxProps: COMBOBOX_PROPS };

  return (
    <StandardCard
      component="section"
      id={id}
      aria-labelledby={`${id}-title`}
      className="account-appearance"
    >
      <Stack gap="var(--fo-space-sm)">
        <Group justify="space-between" align="center" wrap="nowrap">
          <Title id={`${id}-title`} variant="section" order={3} tabIndex={-1}>
            Appearance
          </Title>
          <Text
            variant="meta"
            role="status"
            aria-live="polite"
            className="account-saveStatus"
          >
            {props.statusText}
          </Text>
        </Group>

        {props.failure ? (
          <FormStatus
            loading={false}
            result={{ ok: false, message: APPEARANCE_COPY.saveFailed }}
            onRetry={props.onRetry}
          />
        ) : null}

        <Stack gap="var(--fo-space-xs)">
          <Stack gap="var(--fo-space-0)">
            <Text id={`${id}-mode-label`} className="account-controlLabel">
              Mode
            </Text>
            <SegmentedControl
              fullWidth
              orientation={orientation}
              aria-labelledby={`${id}-mode-label`}
              aria-describedby={`${id}-mode-helper`}
              data={view.mode.options}
              value={view.mode.value}
              onChange={(value) => props.onModeChange(value as ModePreference)}
            />
          </Stack>
          <Text id={`${id}-mode-helper`} variant="meta">
            {view.mode.helper}
          </Text>
          {view.mode.note ? <Text variant="meta">{view.mode.note}</Text> : null}
        </Stack>

        <Stack gap="var(--fo-space-xs)">
          <Stack gap="var(--fo-space-0)">
            <Text id={`${id}-selection-label`} className="account-controlLabel">
              Theme
            </Text>
            <SegmentedControl
              fullWidth
              aria-labelledby={`${id}-selection-label`}
              aria-describedby={`${id}-selection-helper`}
              data={view.selection.options}
              value={view.selection.value}
              onChange={(value) => props.onSelectionChange(value as AppearanceSelection)}
            />
          </Stack>
          <Text id={`${id}-selection-helper`} variant="meta">
            {view.selection.note ?? view.selection.helper}
          </Text>
        </Stack>

        {view.fixed ? (
          <Select
            label="Your theme"
            searchable={false}
            allowDeselect={false}
            withCheckIcon
            checkIconPosition="right"
            comboboxProps={COMBOBOX_PROPS}
            data={view.fixed.data}
            value={view.fixed.value}
            onChange={(value) => {
              if (value) props.onFixedChange(value as BrandId);
            }}
          />
        ) : null}

        {view.random ? (
          <Box>
            <MultiSelect
              label="Themes to include"
              searchable={false}
              hidePickedOptions={false}
              clearable={false}
              withCheckIcon
              checkIconPosition="right"
              placeholder="Choose…"
              maxDropdownHeight={LIST_MAX_HEIGHT}
              scrollAreaProps={{ type: "always" }}
              aria-describedby={view.random.helper ? `${id}-random-helper` : undefined}
              data={view.random.data}
              value={view.random.value}
              onChange={props.onRandomChange}
              {...openProps}
            />
            {view.random.helper ? (
              <Text id={`${id}-random-helper`} variant="meta" mt="var(--fo-space-xs)">
                {view.random.helper}
              </Text>
            ) : null}
          </Box>
        ) : null}

        {view.conflict ? (
          <Stack gap="var(--fo-space-xs)">
            <Stack gap="var(--fo-space-0)">
              <Text id={`${id}-policy-label`} className="account-controlLabel">
                Themes with one mode
              </Text>
              <SegmentedControl
                fullWidth
                orientation={orientation}
                aria-labelledby={`${id}-policy-label`}
                aria-describedby={`${id}-policy-helper`}
                data={view.conflict.options}
                value={view.conflict.value}
                onChange={(value) => props.onPolicyChange(value as SingleModePolicy)}
              />
            </Stack>
            <Text id={`${id}-policy-helper`} variant="meta">
              {view.conflict.helper}
            </Text>
          </Stack>
        ) : null}
      </Stack>
    </StandardCard>
  );
}
