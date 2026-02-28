import { Combobox, Group, Image, InputBase, Stack, Text, useCombobox } from "@ui";
import { useEffect, useMemo, useState } from "react";
import { includesNormalized } from "@fantasy-oscars/shared";
import { fetchJson } from "@/lib/api";

export type SelectedContributor = {
  key: string;
  name: string;
  tmdb_id: number | null;
};

export function PeopleCombobox(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  localOptions: Array<{
    key: string;
    name: string;
    tmdb_id: number | null;
    label: string;
  }>;
  onSelectContributor: (input: SelectedContributor) => void;
  disabled?: boolean;
}) {
  const { label, value, onChange, localOptions, onSelectContributor, disabled } = props;

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption()
  });
  const [mode, setMode] = useState<"local" | "tmdb">("local");
  const [tmdbLoading, setTmdbLoading] = useState(false);
  const [tmdbResults, setTmdbResults] = useState<
    Array<{
      tmdb_id: number;
      name: string;
      known_for_department: string | null;
      profile_url: string | null;
      linked_person_id: number | null;
      linked_person_name: string | null;
    }>
  >([]);

  useEffect(() => {
    if (value.trim()) return;
    setMode("local");
    setTmdbLoading(false);
    setTmdbResults([]);
  }, [value]);

  useEffect(() => {
    if (mode !== "tmdb") {
      setTmdbLoading(false);
      setTmdbResults([]);
      return;
    }
    const q = value.trim();
    if (!q || q.length < 2) {
      setTmdbLoading(false);
      setTmdbResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setTmdbLoading(true);
      void fetchJson<{
        results: Array<{
          tmdb_id: number;
          name: string;
          known_for_department: string | null;
          profile_url: string | null;
          linked_person_id: number | null;
          linked_person_name: string | null;
        }>;
      }>(`/admin/people/tmdb-search?q=${encodeURIComponent(q)}`, {
        method: "GET"
      }).then((res) => {
        if (cancelled) return;
        setTmdbLoading(false);
        if (!res.ok) {
          setTmdbResults([]);
          return;
        }
        setTmdbResults(res.data?.results ?? []);
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mode, value]);

  const filteredLocalOptions = useMemo(() => {
    return localOptions.filter((p) => includesNormalized(p.label, value)).slice(0, 50);
  }, [localOptions, value]);

  return (
    <Combobox
      store={combobox}
      withinPortal
      position="bottom-start"
      middlewares={{ flip: true, shift: true }}
      onOptionSubmit={(val) => {
        if (val.startsWith("mode:tmdb:")) {
          setMode("tmdb");
          combobox.openDropdown();
          return;
        }
        if (val.startsWith("create-unlinked:")) {
          const name = val.slice("create-unlinked:".length).trim();
          if (!name) return;
          onSelectContributor({
            key: `unlinked:${name.toLowerCase()}`,
            name,
            tmdb_id: null
          });
          onChange("");
          setMode("local");
          combobox.closeDropdown();
          return;
        }
        if (val.startsWith("local:")) {
          const key = val.slice("local:".length);
          const picked = localOptions.find((p) => p.key === key);
          if (!picked) return;
          onSelectContributor({
            key: picked.key,
            name: picked.name,
            tmdb_id: picked.tmdb_id ?? null
          });
          onChange("");
          combobox.closeDropdown();
          return;
        }
        if (val.startsWith("tmdb:")) {
          const tmdbId = Number(val.slice("tmdb:".length));
          const picked = tmdbResults.find((r) => r.tmdb_id === tmdbId);
          if (!picked) return;
          if (picked.linked_person_id && picked.linked_person_name) {
            onSelectContributor({
              key: `person:${picked.linked_person_id}`,
              name: picked.linked_person_name,
              tmdb_id: picked.tmdb_id
            });
          } else {
            onSelectContributor({
              key: `tmdb:${picked.tmdb_id}`,
              name: picked.name,
              tmdb_id: picked.tmdb_id
            });
          }
          onChange("");
          setMode("local");
          combobox.closeDropdown();
          return;
        }
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
        {mode === "local" ? (
          <Combobox.Options>
            {filteredLocalOptions.length === 0 ? (
              <Combobox.Empty>
                <Text size="sm" className="muted">
                  No matching people
                </Text>
              </Combobox.Empty>
            ) : (
              filteredLocalOptions.map((o) => (
                <Combobox.Option key={o.key} value={`local:${o.key}`}>
                  <Text size="sm">{o.label}</Text>
                </Combobox.Option>
              ))
            )}
          </Combobox.Options>
        ) : (
          <Combobox.Options className="fo-filmComboboxResults">
            {tmdbLoading ? (
              <Combobox.Empty>
                <Text size="sm" className="muted">
                  Searching TMDB...
                </Text>
              </Combobox.Empty>
            ) : tmdbResults.length === 0 ? (
              <Combobox.Empty>
                <Text size="sm" className="muted">
                  No TMDB matches
                </Text>
              </Combobox.Empty>
            ) : (
              tmdbResults.map((r) => (
                <Combobox.Option key={`tmdb-${r.tmdb_id}`} value={`tmdb:${r.tmdb_id}`}>
                  <Group gap="sm" align="flex-start" wrap="nowrap">
                    <Image
                      src={r.profile_url}
                      alt=""
                      className="fo-filmSearchPoster"
                      radius="sm"
                    />
                    <Stack gap="var(--fo-space-4)" className="fo-flex1Minw0">
                      <Text size="sm" fw="var(--fo-font-weight-semibold)" lineClamp={1}>
                        {r.name}
                      </Text>
                      <Text size="xs" className="muted">
                        {r.known_for_department ?? "Department unknown"}
                      </Text>
                      {r.linked_person_id ? (
                        <Text size="xs" c="dimmed" lineClamp={1}>
                          Already linked to:{" "}
                          {r.linked_person_name ?? `Person #${r.linked_person_id}`}
                        </Text>
                      ) : null}
                    </Stack>
                  </Group>
                </Combobox.Option>
              ))
            )}
          </Combobox.Options>
        )}
        {mode === "local" && value.trim() ? (
          <Combobox.Options className="fo-filmComboboxEscape">
            <Combobox.Option value={`mode:tmdb:${value.trim()}`}>
              <Text size="sm" fw="var(--fo-font-weight-bold)">
                Create person: {value.trim()}
              </Text>
            </Combobox.Option>
          </Combobox.Options>
        ) : null}
        {mode === "tmdb" && value.trim() ? (
          <Combobox.Options className="fo-filmComboboxEscape">
            <Combobox.Option value={`create-unlinked:${value.trim()}`}>
              <Text size="sm" fw="var(--fo-font-weight-bold)">
                Create unlinked person: {value.trim()}
              </Text>
            </Combobox.Option>
          </Combobox.Options>
        ) : null}
      </Combobox.Dropdown>
    </Combobox>
  );
}
