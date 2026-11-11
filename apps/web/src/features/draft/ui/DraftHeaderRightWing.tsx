import {
  Box,
  Button,
  Group,
  Menu,
  SegmentedControl,
  Switch,
  Text,
  Tooltip,
  UnstyledButton
} from "@ui";
import { AnimalAvatarIcon } from "@/shared/animalAvatarIcon";

export function DraftHeaderRightWing(props: {
  compactHeader: boolean;
  showDraftControls: boolean;
  canManageDraft: boolean;
  isPre: boolean;
  isPaused: boolean;
  isCompleted: boolean;
  view: "draft" | "roster";
  onViewChange: (v: "draft" | "roster") => void;
  canToggleView: boolean;
  showDrafted: boolean;
  onToggleShowDrafted: (next: boolean) => void;
  showDraftedVisible: boolean;
  soundEnabled: boolean;
  onToggleSound: () => void;
  showCursorSpyToggle: boolean;
  cursorSpyUserEnabled: boolean;
  onToggleCursorSpy: () => void;
  onStartDraft: () => void;
  onPauseDraft: () => void;
  onResumeDraft: () => void;
  userLabel: string;
  userAvatarKey: string | null;
}) {
  const { compactHeader } = props;
  const draftControlLabel = props.isPre
    ? "Start draft"
    : props.isPaused
      ? "Resume draft"
      : "Pause draft";
  const soundState = props.soundEnabled ? "on" : "off";
  const cursorSpyState = props.cursorSpyUserEnabled ? "on" : "off";

  return (
    <>
      {props.showDraftControls && props.canManageDraft ? (
        <Box className="drh-pauseWrap">
          <Tooltip label={draftControlLabel} position="bottom" withArrow>
            <UnstyledButton
              type="button"
              className="drh-pause"
              aria-label={draftControlLabel}
              onClick={() => {
                if (props.isPre) props.onStartDraft();
                else if (props.isPaused) props.onResumeDraft();
                else props.onPauseDraft();
              }}
            >
              <Text component="span" className="mi-icon mi-icon-tiny" aria-hidden="true">
                {props.isPre || props.isPaused ? "play_arrow" : "pause"}
              </Text>
            </UnstyledButton>
          </Tooltip>
        </Box>
      ) : null}

      {!compactHeader && props.showDraftControls ? (
        <Box className="drh-controls">
          <Box className="drh-controlsGrid">
            <Box className="drh-controlRow">
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
            </Box>
            <Box className="drh-controlRow">
              {props.showDraftedVisible ? (
                <Switch
                  size="sm"
                  label="Show drafted"
                  labelPosition="left"
                  classNames={{ root: "drh-switchRoot", label: "drh-label" }}
                  checked={props.showDrafted}
                  onChange={(e) => props.onToggleShowDrafted(e.currentTarget.checked)}
                />
              ) : (
                <>
                  <Text className="drh-label">Show drafted</Text>
                  <Box className="drh-toggleSlot">
                    <Box className="drh-togglePlaceholder" aria-hidden="true" />
                  </Box>
                </>
              )}
            </Box>
            <Box className="drh-toggleBtns">
              <Tooltip label={`Draft sounds: ${soundState}`} position="bottom" withArrow>
                <Button
                  type="button"
                  variant="subtle"
                  className="drh-toggleBtn"
                  onClick={props.onToggleSound}
                  aria-label="Draft sounds"
                  aria-pressed={props.soundEnabled}
                >
                  <Text component="span" className="gicon" aria-hidden="true">
                    {props.soundEnabled ? "volume_up" : "volume_off"}
                  </Text>
                </Button>
              </Tooltip>
              {props.showCursorSpyToggle ? (
                <Tooltip
                  label={`Cursor spy: ${cursorSpyState}`}
                  position="bottom"
                  withArrow
                >
                  <Button
                    type="button"
                    variant="subtle"
                    className="drh-toggleBtn"
                    onClick={props.onToggleCursorSpy}
                    aria-label="Cursor spy"
                    aria-pressed={props.cursorSpyUserEnabled}
                  >
                    <Text component="span" className="gicon" aria-hidden="true">
                      {props.cursorSpyUserEnabled ? "visibility" : "visibility_off"}
                    </Text>
                  </Button>
                </Tooltip>
              ) : null}
            </Box>
          </Box>
        </Box>
      ) : null}

      {compactHeader ? (
        <Group className="drh-stowaways" gap="xs" wrap="nowrap">
          <Menu withinPortal position="bottom-end" shadow="md">
            <Menu.Target>
              <Button
                type="button"
                variant="subtle"
                className="drh-settingsBtn"
                aria-label="Settings"
              >
                <Text component="span" className="gicon" aria-hidden="true">
                  settings
                </Text>
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={
                  <Text component="span" className="gicon" aria-hidden="true">
                    {props.soundEnabled ? "volume_up" : "volume_off"}
                  </Text>
                }
                onClick={props.onToggleSound}
              >
                {`Draft sounds: ${soundState}`}
              </Menu.Item>

              {props.showCursorSpyToggle ? (
                <Menu.Item
                  leftSection={
                    <Text component="span" className="gicon" aria-hidden="true">
                      {props.cursorSpyUserEnabled ? "visibility" : "visibility_off"}
                    </Text>
                  }
                  onClick={props.onToggleCursorSpy}
                >
                  {`Cursor spy: ${cursorSpyState}`}
                </Menu.Item>
              ) : null}

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
            </Menu.Dropdown>
          </Menu>

          <Box
            className="drh-userBadge"
            role="group"
            aria-label={`Signed in as ${props.userLabel}`}
            title={props.userLabel}
          >
            <AnimalAvatarIcon avatarKey={props.userAvatarKey} size="md" />
            <Text className="drh-userText">{props.userLabel}</Text>
          </Box>
        </Group>
      ) : (
        <Group className="drh-stowaways" gap="xs" wrap="nowrap">
          <Box className="drh-userBadge">
            <AnimalAvatarIcon avatarKey={props.userAvatarKey} size="md" />
            <Text className="drh-userText">{props.userLabel}</Text>
          </Box>
        </Group>
      )}
    </>
  );
}
