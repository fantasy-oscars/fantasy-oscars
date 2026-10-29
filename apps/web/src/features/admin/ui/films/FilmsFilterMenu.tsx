import { Box, Button, Group, Menu, Select, Stack } from "@ui";

export function FilmsFilterMenu(props: {
  activeFilters: number;
  yearOptions: Array<{ value: string; label: string }>;
  year: string;
  setYear: (v: string) => void;
  linked: "all" | "linked" | "unlinked";
  setLinked: (v: "all" | "linked" | "unlinked") => void;
  nominated: "all" | "nominated" | "not_nominated";
  setNominated: (v: "all" | "nominated" | "not_nominated") => void;
}) {
  return (
    <Menu closeOnItemClick={false} withinPortal position="bottom-end">
      <Menu.Target>
        <Button variant="default">
          Filters{props.activeFilters > 0 ? ` (${props.activeFilters})` : ""}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Box p="sm" className="fo-comboboxPanelNarrow">
          <Stack gap="xs">
            <Select
              label="Year"
              data={props.yearOptions}
              value={props.year}
              onChange={(v) => props.setYear(v ?? "all")}
            />
            <Select
              label="TMDB link"
              data={[
                { value: "all", label: "All" },
                { value: "linked", label: "Linked" },
                { value: "unlinked", label: "Unlinked" }
              ]}
              value={props.linked}
              onChange={(v) =>
                props.setLinked(
                  v === "linked" || v === "unlinked" || v === "all" ? v : "all"
                )
              }
            />
            <Select
              label="Nomination status"
              data={[
                { value: "all", label: "All" },
                { value: "nominated", label: "Nominated" },
                { value: "not_nominated", label: "Not nominated" }
              ]}
              value={props.nominated}
              onChange={(v) =>
                props.setNominated(
                  v === "nominated" || v === "not_nominated" || v === "all" ? v : "all"
                )
              }
            />
            <Group justify="flex-end">
              <Button
                variant="subtle"
                onClick={() => {
                  props.setYear("all");
                  props.setLinked("all");
                  props.setNominated("all");
                }}
              >
                Clear
              </Button>
            </Group>
          </Stack>
        </Box>
      </Menu.Dropdown>
    </Menu>
  );
}
