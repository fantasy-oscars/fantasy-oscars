import { Link, NavLink } from "react-router-dom";
import { Box, Button, Divider, Group, Select, Stack, Text, Title } from "@ui";
import type { CeremonyOption } from "@/orchestration/adminCeremonies";

export function AdminCeremoniesLayoutScreen(props: {
  selected: CeremonyOption;
  options: CeremonyOption[];
  onSelectCeremony: (id: string) => void;
  children: React.ReactNode;
}) {
  const { selected, options, onSelectCeremony, children } = props;

  const sublinkClass = ({ isActive }: { isActive: boolean }) =>
    `admin-sublink${isActive ? " is-active" : ""}`;

  return (
    <Stack component="section" className="stack" gap="md">
      <Group
        className="header-with-controls"
        justify="space-between"
        align="start"
        wrap="wrap"
      >
        <Box>
          <Title order={2} className="baseline-textHeroTitle">
            Ceremonies
          </Title>
          <Text className="muted">
            Selected: {selected.name || "(Unnamed)"}{" "}
            {selected.code ? `(${selected.code})` : ""}
          </Text>
        </Box>

        <Group className="inline-actions" wrap="wrap">
          <Button component={Link} to="/admin/ceremonies" variant="subtle">
            All ceremonies
          </Button>
          <Select
            label="Ceremony"
            value={String(selected.id)}
            onChange={(v) => onSelectCeremony(v ?? String(selected.id))}
            data={options.map((o) => ({
              value: String(o.id),
              label: `${o.name || "(Unnamed)"}${o.code ? ` (${o.code})` : ""}`
            }))}
          />
        </Group>
      </Group>

      <Divider />

      <Group
        component="nav"
        className="admin-subnav"
        aria-label="Ceremony admin"
        wrap="wrap"
      >
        <NavLink
          to={`/admin/ceremonies/${selected.id}/overview`}
          className={sublinkClass}
        >
          Overview
        </NavLink>
        <NavLink
          to={`/admin/ceremonies/${selected.id}/categories`}
          className={sublinkClass}
        >
          Categories
        </NavLink>
        <NavLink
          to={`/admin/ceremonies/${selected.id}/nominees`}
          className={sublinkClass}
        >
          Nominees
        </NavLink>
        <NavLink to={`/admin/ceremonies/${selected.id}/winners`} className={sublinkClass}>
          Winners
        </NavLink>
        <NavLink to={`/admin/ceremonies/${selected.id}/scoring`} className={sublinkClass}>
          Scoring
        </NavLink>
        <NavLink to={`/admin/ceremonies/${selected.id}/lock`} className={sublinkClass}>
          Lock / Archive
        </NavLink>
      </Group>

      <Divider />

      {children}
    </Stack>
  );
}
