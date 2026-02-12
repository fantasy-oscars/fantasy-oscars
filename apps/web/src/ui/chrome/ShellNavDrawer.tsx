import { Anchor, Button, Divider, Drawer, Stack } from "@ui";
import { NavLink } from "react-router-dom";

export function ShellNavDrawer(props: {
  opened: boolean;
  onClose: () => void;
  primaryLinks: Array<{ to: string; label: string }>;
  user: null | { sub: string };
  onLogout: () => Promise<void>;
}) {
  return (
    <Drawer opened={props.opened} onClose={props.onClose} position="left" withinPortal={false} title="Menu" size="xs">
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
            <Button
              type="button"
              variant="subtle"
              color="red"
              onClick={() => void props.onLogout()}
              className="fo-navDrawerLogout"
            >
              Logout
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
              Login
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
