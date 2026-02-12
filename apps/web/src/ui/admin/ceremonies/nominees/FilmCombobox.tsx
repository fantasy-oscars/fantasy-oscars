import { Combobox, InputBase, Text, useCombobox } from "@ui";
import { includesNormalized, normalizeForSearch } from "@fantasy-oscars/shared";
import { formatFilmTitleWithYear } from "../../../../lib/films";

export function FilmCombobox(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  films: Array<{ id: number; title: string; release_year?: number | null }>;
}) {
  const { label, value, onChange, films } = props;

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption()
  });

  const data = films
    .map((f) => ({
      id: f.id,
      label: formatFilmTitleWithYear(f.title, f.release_year ?? null)
    }))
    .filter((f) => includesNormalized(f.label, value))
    .slice(0, 50);

  const hasExactMatch = (() => {
    const t = normalizeForSearch(value);
    if (!t) return true;
    return films.some(
      (f) =>
        normalizeForSearch(formatFilmTitleWithYear(f.title, f.release_year ?? null)) === t
    );
  })();

  return (
    <Combobox
      store={combobox}
      withinPortal={false}
      onOptionSubmit={(val) => {
        if (val.startsWith("create:")) {
          const title = val.slice("create:".length);
          onChange(title);
          combobox.closeDropdown();
          return;
        }
        if (val.startsWith("film:")) {
          const label = val.slice("film:".length);
          onChange(label);
          combobox.closeDropdown();
          return;
        }
        onChange(val);
        combobox.closeDropdown();
      }}
    >
      <Combobox.Target>
        <InputBase
          label={label}
          component="input"
          value={value}
          onChange={(e) => {
            onChange(e.currentTarget.value);
            combobox.openDropdown();
          }}
          onFocus={() => combobox.openDropdown()}
          placeholder="Type film title or id…"
        />
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options>
          {!hasExactMatch && value.trim() ? (
            <Combobox.Option value={`create:${value.trim()}`}>
              <Text size="sm" fw="var(--fo-font-weight-bold)">
                Create film: {value.trim()}
              </Text>
            </Combobox.Option>
          ) : null}

          {data.length === 0 ? (
            <Combobox.Empty>
              <Text size="sm" className="muted">
                No matching films
              </Text>
            </Combobox.Empty>
          ) : (
            data.map((f) => (
              <Combobox.Option key={f.id} value={`film:${f.label}`}>
                <Text size="sm">{f.label}</Text>
              </Combobox.Option>
            ))
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
