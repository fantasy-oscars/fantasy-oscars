import { Box, Button, Group, Indicator, Menu, Text, Tooltip, UnstyledButton } from "@ui";
import type { MouseEvent, RefObject } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AnimalAvatarIcon } from "@/shared/animalAvatarIcon";
import { NAV_DRAWER_CONTROLS_ID } from "./ShellNavDrawer";
import { Wordmark } from "./Wordmark";

/** Accessible name of the invites link; the count is capped like the badge. */
function invitesLabel(count: number): string {
  if (count <= 0) return "Invites";
  return `Invites, ${count > 9 ? "9+" : count} pending`;
}

export function ShellHeader(props: {
  navMode: "inline" | "drawer";
  /** The header row, measured by the layout to decide between inline and drawer. */
  rowRef: RefObject<HTMLDivElement | null>;
  navDrawerOpen: boolean;
  onOpenNavDrawer: () => void;

  user: null | {
    sub: string;
    username: string | null;
    is_admin: boolean;
    admin_role?: "NONE" | "OPERATOR" | "SUPER_ADMIN";
    avatar_key: string | null;
  };
  loading: boolean;
  logout: () => Promise<void>;
  inviteCount: number;

  userMenuOpen: boolean;
  setUserMenuOpen: (open: boolean) => void;
  /** Sees every wordmark click before navigation; may prevent it (the shuffle). */
  onWordmarkClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();

  const inline = props.navMode === "inline";

  return (
    <Box component="header" className="site-header">
      <Group
        ref={props.rowRef}
        className="site-header-row"
        justify="space-between"
        align="center"
        wrap="nowrap"
      >
        <Group className="site-header-lead" gap="sm" wrap="nowrap">
          {props.navMode === "drawer" ? (
            <Tooltip label="Open navigation" openDelay={400}>
              <UnstyledButton
                type="button"
                className="fo-headerIconBtn"
                onClick={props.onOpenNavDrawer}
                aria-label="Open navigation"
                aria-expanded={props.navDrawerOpen}
                aria-controls={NAV_DRAWER_CONTROLS_ID}
              >
                <Text component="span" className="mi-icon" aria-hidden="true">
                  menu
                </Text>
              </UnstyledButton>
            </Tooltip>
          ) : null}

          <Wordmark onClick={props.onWordmarkClick} />
        </Group>

        <Group
          className="site-header-actions"
          gap="var(--fo-space-8)"
          justify="flex-end"
          align="center"
          wrap="nowrap"
        >
          {props.user ? (
            <Indicator
              disabled={props.inviteCount <= 0}
              label={props.inviteCount > 9 ? "9+" : String(props.inviteCount)}
            >
              <Tooltip label="Invites" openDelay={400}>
                <UnstyledButton
                  component={Link}
                  to="/invites"
                  className="fo-headerIconBtn"
                  aria-label={invitesLabel(props.inviteCount)}
                >
                  <Text component="span" className="mi-icon" aria-hidden="true">
                    mail
                  </Text>
                </UnstyledButton>
              </Tooltip>
            </Indicator>
          ) : null}

          {props.user && inline ? (
            <Menu
              opened={props.userMenuOpen}
              onChange={props.setUserMenuOpen}
              withinPortal={false}
            >
              <Menu.Target>
                <UnstyledButton
                  type="button"
                  className="fo-headerIconBtn fo-headerAccountBtn"
                  aria-label={`${props.user.username ?? props.user.sub}, account menu`}
                  title={props.user.username ?? props.user.sub}
                >
                  <AnimalAvatarIcon avatarKey={props.user.avatar_key} size="lg" />
                  <Text component="span" className="fo-headerAccountName">
                    {props.user.username ?? props.user.sub}
                  </Text>
                  <Text
                    component="span"
                    className="mi-icon fo-headerAccountCaret"
                    aria-hidden="true"
                  >
                    expand_more
                  </Text>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label className="fo-headerAccountLabel">
                  {props.user.username ?? props.user.sub}
                </Menu.Label>
                <Menu.Item
                  leftSection={
                    <Text component="span" className="mi-icon" aria-hidden="true">
                      person
                    </Text>
                  }
                  onClick={() => navigate("/account")}
                >
                  Account
                </Menu.Item>
                <Menu.Item
                  leftSection={
                    <Text component="span" className="mi-icon" aria-hidden="true">
                      palette
                    </Text>
                  }
                  onClick={() => navigate("/account#appearance")}
                >
                  Appearance
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  leftSection={
                    <Text component="span" className="mi-icon" aria-hidden="true">
                      logout
                    </Text>
                  }
                  onClick={() => void props.logout()}
                >
                  Log out
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          ) : !props.user && inline ? (
            props.loading ? (
              <Text className="nav-muted fo-headerChecking" variant="meta">
                Checking…
              </Text>
            ) : (
              <>
                <Button component={Link} to="/register" variant="ghost">
                  Create account
                </Button>
                <Button
                  component={Link}
                  to="/login"
                  state={{
                    from: `${location.pathname}${location.search ?? ""}${location.hash ?? ""}`
                  }}
                  variant="secondary"
                >
                  Log in
                </Button>
              </>
            )
          ) : !props.user && !props.loading ? (
            <Button
              component={Link}
              to="/login"
              state={{
                from: `${location.pathname}${location.search ?? ""}${location.hash ?? ""}`
              }}
              variant="secondary"
            >
              Log in
            </Button>
          ) : null}
        </Group>
      </Group>
    </Box>
  );
}
