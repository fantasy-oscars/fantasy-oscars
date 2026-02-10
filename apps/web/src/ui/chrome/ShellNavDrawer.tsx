import { Anchor, Button, Divider, Drawer, Stack } from "@mantine/core";
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
        <Stack gap={0}>
          {props.primaryLinks.map((l) => (
            <Anchor
              key={l.to}
              component={NavLink}
              to={l.to}
              className="nav-link"
              underline="never"
              onClick={props.onClose}
              style={{ paddingBlock: 10 }}
            >
              {l.label}
            </Anchor>
          ))}
        </Stack>

        <Divider />

        {props.user ? (
          <Stack gap={0}>
            <Anchor
              component={NavLink}
              to="/account"
              className="nav-link"
              underline="never"
              onClick={props.onClose}
              style={{ paddingBlock: 10 }}
            >
              Account
            </Anchor>
            <Button
              type="button"
              variant="subtle"
              color="red"
              onClick={() => void props.onLogout()}
              style={{ justifyContent: "flex-start", paddingInline: 0 }}
            >
              Logout
            </Button>
          </Stack>
        ) : (
          <Stack gap={0}>
            <Anchor
              component={NavLink}
              to="/login"
              className="nav-link"
              underline="never"
              onClick={props.onClose}
              style={{ paddingBlock: 10 }}
            >
              Login
            </Anchor>
            <Anchor
              component={NavLink}
              to="/register"
              className="nav-link"
              underline="never"
              onClick={props.onClose}
              style={{ paddingBlock: 10 }}
            >
              Create account
            </Anchor>
          </Stack>
        )}
      </Stack>
    </Drawer>
  );
}

