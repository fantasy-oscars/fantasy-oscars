import { Combobox, Text, TextInput, useCombobox } from "@ui";

export function UserSearchCombobox(props: {
  label: string;
  value: string;
  disabled: boolean;
  searching: boolean;
  options: Array<{ id: number; username: string }>;
  onChange: (next: string) => void;
  onPick: (id: number, username: string) => void;
}) {
  const { label, value, disabled, searching, options, onChange, onPick } = props;
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption()
  });

  const hasValue = Boolean(value.trim());

  return (
    <Combobox
      store={combobox}
      withinPortal={false}
      onOptionSubmit={(v) => {
        const id = Number(v);
        const picked = options.find((o) => o.id === id);
        if (!picked) return;
        onPick(picked.id, picked.username);
        combobox.closeDropdown();
      }}
    >
      <Combobox.Target>
        <TextInput
          label={label}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            onChange(e.currentTarget.value);
            if (!disabled) combobox.openDropdown();
          }}
          onFocus={() => {
            if (!disabled) combobox.openDropdown();
          }}
          onBlur={() => combobox.closeDropdown()}
          placeholder="Username"
          rightSection={
            searching ? (
              <Text component="span" className="baseline-textMeta" c="dimmed">
                …
              </Text>
            ) : null
          }
        />
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Options>
          {options.length === 0 ? (
            <Combobox.Empty>
              <Text className="baseline-textBody" c="dimmed">
                {hasValue ? "No matches" : "Type to search"}
              </Text>
            </Combobox.Empty>
          ) : (
            options.map((o) => (
              <Combobox.Option key={o.id} value={String(o.id)}>
                <Text className="baseline-textBody">{o.username}</Text>
              </Combobox.Option>
            ))
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}

