import { Anchor, Box, Group } from "@ui";
import type { RefObject } from "react";
import { NavLink } from "react-router-dom";

export function ShellPrimaryNav(props: {
  navMode: "inline" | "drawer";
  navLinksRef: RefObject<HTMLDivElement | null>;
  links: Array<{ to: string; label: string }>;
}) {
  return (
    <Box
      component="nav"
      className={["site-nav", props.navMode === "drawer" ? "is-collapsed" : ""].join(" ")}
      aria-label="Primary"
      aria-hidden={props.navMode === "drawer" ? "true" : undefined}
    >
      <Group justify="space-between" wrap="wrap" w="100%">
        <Group ref={props.navLinksRef} className="nav-links" gap="md" wrap="nowrap">
          {props.links.map((l) => (
            <Anchor key={l.to} component={NavLink} to={l.to} className="nav-link" underline="never">
              {l.label}
            </Anchor>
          ))}
        </Group>
      </Group>
    </Box>
  );
}

