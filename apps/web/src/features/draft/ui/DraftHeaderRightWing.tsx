import {
  Box,
  Button,
  Group,
  Menu,
  SegmentedControl,
  Switch,
  Text,
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
  themeIcon: string;
  onToggleTheme: () => void;
  onStartDraft: () => void;
  onPauseDraft: () => void;
  onResumeDraft: () => void;
  userLabel: string;
  userAvatarKey: string | null;
}) {
  const { compactHeader } = props;

  return (
    <>
      {!compactHeader && props.showDraftControls && props.canManageDraft ? (
        <Box className="drh-pauseWrap">
          <UnstyledButton
            type="button"
            className="drh-pause"
            aria-label={
              props.isPre
                ? "Start draft"
                : props.isPaused
                  ? "Resume draft"
                  : "Pause draft"
            }
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
                    onChange={(e) => props.onToggleShowDrafted(e.currentTarget.checked)}
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
          <Menu withinPortal position="bottom-end" shadow="md">
            <Menu.Target>
              <Button
                type="button"
                variant="subtle"
                className="theme-toggle"
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
                      onChange={(e) => props.onToggleShowDrafted(e.currentTarget.checked)}
                    />
                  </Group>
                </Menu.Item>
              ) : null}

              {props.showDraftControls && props.canManageDraft ? (
                props.isPre ? (
                  <Menu.Item onClick={props.onStartDraft}>Start draft</Menu.Item>
                ) : props.isPaused ? (
                  <Menu.Item onClick={props.onResumeDraft}>Resume draft</Menu.Item>
                ) : !props.isCompleted ? (
                  <Menu.Item onClick={props.onPauseDraft}>Pause draft</Menu.Item>
                ) : null
              ) : null}
            </Menu.Dropdown>
          </Menu>

          <Box className="drh-userBadge">
            <AnimalAvatarIcon avatarKey={props.userAvatarKey} size="md" />
            <Text className="drh-userText">{props.userLabel}</Text>
          </Box>
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
            <AnimalAvatarIcon avatarKey={props.userAvatarKey} size="md" />
            <Text className="drh-userText">{props.userLabel}</Text>
          </Box>
        </Group>
      )}
    </>
  );
}
