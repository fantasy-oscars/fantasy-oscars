import {
  Anchor,
  Box,
  Button,
  Group,
  Indicator,
  Menu,
  Text,
  Title,
  type MantineColorScheme
} from "@mantine/core";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AnimalAvatarIcon } from "../animalAvatarIcon";

export function ShellHeader(props: {
  navMode: "inline" | "drawer";
  onOpenNavDrawer: () => void;

  user:
    | null
    | {
        sub: string;
        username: string | null;
        is_admin: boolean;
        avatar_key: string | null;
      };
  loading: boolean;
  logout: () => Promise<void>;
  inviteCount: number;

  userMenuOpen: boolean;
  setUserMenuOpen: (open: boolean) => void;

  colorScheme: MantineColorScheme;
  setColorScheme: (next: MantineColorScheme) => void;
  themeToggleIcon: string;
}) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <Box component="header" className="site-header">
      <Group className="site-header-row" justify="space-between" align="center" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          {props.navMode === "drawer" ? (
            <Button
              type="button"
              variant="subtle"
              className="theme-toggle"
              onClick={props.onOpenNavDrawer}
              aria-label="Open menu"
            >
              <Text component="span" className="mi-icon" aria-hidden="true">
                menu
              </Text>
            </Button>
          ) : null}

          <Anchor component={Link} to="/" className="brand" underline="never">
            <Title className="site-title" order={1}>
              Fantasy Oscars
            </Title>
          </Anchor>
        </Group>

        <Group className="site-header-actions" justify="flex-end" align="center" wrap="nowrap">
          <Button
            type="button"
            variant="subtle"
            className="theme-toggle"
            onClick={() => props.setColorScheme(props.colorScheme === "dark" ? "light" : "dark")}
            aria-label={`Switch to ${props.colorScheme === "dark" ? "light" : "dark"} mode`}
          >
            <Text component="span" className="gicon" aria-hidden="true">
              {props.themeToggleIcon}
            </Text>
          </Button>

          {props.user ? (
            <Indicator
              disabled={props.inviteCount <= 0}
              label={props.inviteCount > 9 ? "9+" : String(props.inviteCount)}
              size={16}
              offset={4}
              color="yellow"
            >
              <Button
                component={Link}
                to="/invites"
                type="button"
                variant="subtle"
                className="theme-toggle"
                aria-label="Notifications"
              >
                <Text component="span" className="mi-icon" aria-hidden="true">
                  notifications
                </Text>
              </Button>
            </Indicator>
          ) : null}

          {props.user && props.navMode === "inline" ? (
            <Menu opened={props.userMenuOpen} onChange={props.setUserMenuOpen} withinPortal={false}>
              <Menu.Target>
                <Button
                  type="button"
                  variant="subtle"
                  leftSection={<AnimalAvatarIcon avatarKey={props.user.avatar_key} size={26} />}
                  rightSection={
                    <Text component="span" aria-hidden="true">
                      ▾
                    </Text>
                  }
                >
                  {props.user.username ?? props.user.sub}
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => navigate("/account")}>Account</Menu.Item>
                <Menu.Divider />
                <Menu.Item color="red" onClick={() => void props.logout()}>
                  Logout
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          ) : !props.user && props.navMode === "inline" ? (
            <>
              {props.loading && (
                <Text className="nav-muted" c="dimmed">
                  Checking…
                </Text>
              )}
              <Button
                component={Link}
                to="/login"
                state={{
                  from: `${location.pathname}${location.search ?? ""}${location.hash ?? ""}`
                }}
                variant="subtle"
              >
                Login
              </Button>
            </>
          ) : null}
        </Group>
      </Group>
    </Box>
  );
}

