import { Anchor, Button, Divider, Drawer, Stack, Text } from "@ui";
import { NavLink } from "react-router-dom";

/** Mantine derives the drawer's element ids from this prefix. */
const NAV_DRAWER_ID = "primary-nav-drawer";
/** The drawer body, which holds the links; the header button points at it with `aria-controls`. */
export const NAV_DRAWER_CONTROLS_ID = `${NAV_DRAWER_ID}-body`;

export function ShellNavDrawer(props: {
  opened: boolean;
  onClose: () => void;
  primaryLinks: Array<{ to: string; label: string }>;
  user: null | { sub: string };
  onLogout: () => Promise<void>;
  /** The Appearance link was chosen; the drawer closes as part of it. */
  onChooseAppearance: () => void;
  /** The close transition finished and focus has gone back to the menu button. */
  onExited: () => void;
}) {
  return (
    <Drawer
      id={NAV_DRAWER_ID}
      opened={props.opened}
      onClose={props.onClose}
      onExitTransitionEnd={props.onExited}
      position="left"
      withinPortal={false}
      title="Menu"
      size="xs"
      closeButtonProps={{
        "aria-label": "Close navigation",
        size: 44
      }}
    >
      <Stack gap="sm">
        <Stack gap="var(--fo-space-0)">
          {props.primaryLinks.map((l) => (
            <Anchor
              key={l.to}
              component={NavLink}
              to={l.to}
              className="nav-link fo-navDrawerLink"
              underline="never"
              onClick={props.onClose}
            >
              {l.label}
            </Anchor>
          ))}
        </Stack>

        <Divider />

        {props.user ? (
          <Stack gap="var(--fo-space-0)">
            <Anchor
              component={NavLink}
              to="/account"
              className="nav-link fo-navDrawerLink"
              underline="never"
              onClick={props.onClose}
            >
              Account
            </Anchor>
            <Anchor
              component={NavLink}
              to="/account#appearance"
              className="nav-link fo-navDrawerLink"
              underline="never"
              onClick={props.onChooseAppearance}
            >
              Appearance
            </Anchor>
            <Button
              type="button"
              variant="ghost"
              justify="flex-start"
              fullWidth
              leftSection={
                <Text component="span" className="mi-icon" aria-hidden="true">
                  logout
                </Text>
              }
              onClick={() => void props.onLogout()}
              className="fo-navDrawerLogout"
            >
              Log out
            </Button>
          </Stack>
        ) : (
          <Stack gap="var(--fo-space-0)">
            <Anchor
              component={NavLink}
              to="/login"
              className="nav-link fo-navDrawerLink"
              underline="never"
              onClick={props.onClose}
            >
              Log in
            </Anchor>
            <Anchor
              component={NavLink}
              to="/register"
              className="nav-link fo-navDrawerLink"
              underline="never"
              onClick={props.onClose}
            >
              Create account
            </Anchor>
          </Stack>
        )}
      </Stack>
    </Drawer>
  );
}
