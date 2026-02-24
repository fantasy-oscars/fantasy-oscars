import { Combobox, InputBase, Text, useCombobox } from "@ui";

export type ContributorOption =
  | { kind: "tmdb"; value: string; label: string; name: string; tmdb_id: number }
  | { kind: "person"; value: string; label: string; name: string; person_id: number }
  | { kind: "create"; value: string; label: string; name: string };

export function ContributorCombobox(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ContributorOption[];
  disabled: boolean;
  onSubmit: (picked: ContributorOption) => Promise<void>;
}) {
  const { label, value, onChange, options, disabled, onSubmit } = props;
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption()
  });

  return (
    <Combobox
      store={combobox}
      withinPortal
      position="bottom-start"
      middlewares={{ flip: true, shift: true }}
      onOptionSubmit={(val) => {
        const picked = options.find((o) => o.value === val);
        if (!picked) return;
        void onSubmit(picked);
        combobox.closeDropdown();
      }}
    >
      <Combobox.Target>
        <InputBase
          label={label}
          component="input"
          value={value}
          disabled={disabled}
          onChange={(e) => {
            onChange(e.currentTarget.value);
            combobox.openDropdown();
          }}
          onFocus={() => combobox.openDropdown()}
          placeholder="Search people…"
        />
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options>
          {options.length === 0 ? (
            <Combobox.Empty>
              <Text size="sm" className="muted">
                No matching people
              </Text>
            </Combobox.Empty>
          ) : (
            options.map((o) => (
              <Combobox.Option key={o.value} value={o.value}>
                <Text size="sm" fw={o.kind === "create" ? 700 : 400}>
                  {o.label}
                </Text>
              </Combobox.Option>
            ))
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
