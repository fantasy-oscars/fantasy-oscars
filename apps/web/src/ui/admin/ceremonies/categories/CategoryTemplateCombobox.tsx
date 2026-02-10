import { Box, Combobox, InputBase, Stack, Text, useCombobox } from "@mantine/core";
import { useMemo } from "react";

export function CategoryTemplateCombobox(props: {
  disabled: boolean;
  value: string | null;
  onChange: (v: string | null) => void;
  query: string;
  onQueryChange: (q: string) => void;
  options: Array<{ value: string; name: string; code: string }>;
}) {
  const { disabled, value, onChange, query, onQueryChange, options } = props;

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption()
  });

  const selectedLabel = useMemo(() => {
    if (!value) return "";
    const found = options.find((o) => o.value === value);
    return found?.name ?? "";
  }, [options, value]);

  return (
    <Box className="admin-add-select">
      <Combobox
        store={combobox}
        onOptionSubmit={(val) => {
          onChange(val);
          combobox.closeDropdown();
        }}
      >
        <Combobox.Target>
          <InputBase
            component="button"
            type="button"
            disabled={disabled}
            onClick={() => combobox.toggleDropdown()}
            rightSectionPointerEvents="none"
            rightSection="▾"
            aria-label="Add category from template"
          >
            {selectedLabel || "Add category from template..."}
          </InputBase>
        </Combobox.Target>

        <Combobox.Dropdown>
          <Combobox.Search
            value={query}
            onChange={(e) => onQueryChange(e.currentTarget.value)}
            placeholder="Search templates..."
          />
          <Combobox.Options>
            {options.length === 0 ? (
              <Combobox.Empty>
                <Text size="sm">No matching templates</Text>
              </Combobox.Empty>
            ) : (
              options.map((o) => (
                <Combobox.Option value={o.value} key={o.value}>
                  <Stack gap={2}>
                    <Text fw={700} size="sm">
                      {o.name}
                    </Text>
                    <Text className="muted" size="xs">
                      {o.code}
                    </Text>
                  </Stack>
                </Combobox.Option>
              ))
            )}
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>
    </Box>
  );
}

