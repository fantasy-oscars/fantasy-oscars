import { Combobox, InputBase, Text, useCombobox } from "@ui";
import { includesNormalized, normalizeForSearch } from "@fantasy-oscars/shared";
import { formatFilmTitleWithYear } from "@/lib/films";

export function FilmCombobox(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  films: Array<{
    id: number;
    title: string;
    release_year?: number | null;
    tmdb_id?: number | null;
  }>;
}) {
  const { label, value, onChange, films } = props;

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption()
  });

  const groupedByTitle = new Map<
    string,
    Array<{ id: number; title: string; release_year?: number | null; tmdb_id?: number | null }>
  >();
  for (const f of films) {
    const key = normalizeForSearch(f.title);
    const bucket = groupedByTitle.get(key);
    if (bucket) bucket.push(f);
    else groupedByTitle.set(key, [f]);
  }

  const representativeFilms = Array.from(groupedByTitle.values()).map((group) =>
    group
      .slice()
      .sort((a, b) => {
        const aLinked = Number.isInteger(a.tmdb_id) ? 1 : 0;
        const bLinked = Number.isInteger(b.tmdb_id) ? 1 : 0;
        if (aLinked !== bLinked) return bLinked - aLinked;
        const aYear = Number.isInteger(a.release_year) ? Number(a.release_year) : -Infinity;
        const bYear = Number.isInteger(b.release_year) ? Number(b.release_year) : -Infinity;
        if (aYear !== bYear) return bYear - aYear;
        return a.id - b.id;
      })[0]
  );

  const data = representativeFilms
    .map((f) => {
      const label = formatFilmTitleWithYear(f.title, f.release_year ?? null);
      return { id: f.id, label };
    })
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
      withinPortal
      position="bottom-start"
      middlewares={{ flip: true, shift: true }}
      onOptionSubmit={(val) => {
        if (val.startsWith("create:")) {
          const title = val.slice("create:".length);
          onChange(title);
          combobox.closeDropdown();
          return;
        }
        if (val.startsWith("film:")) {
          const idRaw = val.slice("film:".length);
          const id = Number(idRaw);
          if (Number.isFinite(id) && id > 0) {
            onChange(String(id));
            combobox.closeDropdown();
            return;
          }
          onChange(idRaw);
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
              <Combobox.Option key={f.id} value={`film:${f.id}`}>
                <Text size="sm">{f.label}</Text>
              </Combobox.Option>
            ))
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
