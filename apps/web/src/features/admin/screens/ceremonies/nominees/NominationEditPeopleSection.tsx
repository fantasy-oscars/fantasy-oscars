import { ActionIcon, Box, Button, Group, Stack, Text, TextInput } from "@ui";
import { useMemo, useState } from "react";
import { normalizeForSearch } from "@fantasy-oscars/shared";
import { notify } from "@/notifications";
import {
  ContributorCombobox,
  type ContributorOption
} from "@/features/admin/ui/ceremonies/nominees/ContributorCombobox";
import type { FilmCredits } from "./useFilmCredits";

type NominationContributorRow = {
  nomination_contributor_id?: number;
  person_id: number;
  full_name: string;
  tmdb_id?: number | null;
  role_label: string | null;
  sort_order: number;
};

type CreditPerson = NonNullable<NonNullable<FilmCredits["cast"]>[number]>;

export function NominationEditPeopleSection(props: {
  nominationId: number;
  contributors: NominationContributorRow[];
  people: Array<{ id: number; full_name: string; tmdb_id: number | null }>;
  peopleLoading: boolean;
  filmCredits: FilmCredits | null;
  onLinkPerson: (
    personId: number,
    tmdbId: number | null
  ) => Promise<
    | { ok: true; hydrated: boolean }
    | {
        ok: false;
        hydrated: boolean;
        error: string;
        errorCode?: string;
        errorDetails?: Record<string, unknown>;
      }
  >;
  onAddContributor: (
    nominationId: number,
    input: { person_id?: number; name?: string; tmdb_id?: number }
  ) => Promise<void>;
  onRemoveContributor: (
    nominationId: number,
    nominationContributorId: number
  ) => Promise<void>;
}) {
  const {
    nominationId,
    contributors,
    people,
    peopleLoading,
    filmCredits,
    onLinkPerson,
    onAddContributor,
    onRemoveContributor
  } = props;

  const [personLinkOpenId, setPersonLinkOpenId] = useState<number | null>(null);
  const [personTmdbId, setPersonTmdbId] = useState("");
  const [pendingContributorInput, setPendingContributorInput] = useState("");

  const contributorRows = useMemo(() => {
    return contributors.slice().sort((a, b) => a.sort_order - b.sort_order);
  }, [contributors]);

  const creditByPersonId = useMemo(() => {
    const map = new Map<
      number,
      {
        name: string;
        crewJobs: string[];
        crewJobsSet: Set<string>;
        characters: string[];
        characterSet: Set<string>;
        isCast: boolean;
      }
    >();
    const credits = filmCredits;
    if (!credits) return map;

    for (const c of credits.crew ?? []) {
      const tmdbId = Number((c as CreditPerson).tmdb_id ?? (c as CreditPerson).id);
      const name =
        typeof (c as CreditPerson).name === "string"
          ? String((c as CreditPerson).name)
          : "";
      if (!tmdbId || !name) continue;
      const job =
        typeof (c as CreditPerson).job === "string" &&
        String((c as CreditPerson).job).trim()
          ? String((c as CreditPerson).job).trim()
          : typeof (c as CreditPerson).department === "string" &&
              String((c as CreditPerson).department).trim()
            ? String((c as CreditPerson).department).trim()
            : "";
      if (!job) continue;
      const existing = map.get(tmdbId) ?? {
        name,
        crewJobs: [],
        crewJobsSet: new Set<string>(),
        characters: [],
        characterSet: new Set<string>(),
        isCast: false
      };
      if (!existing.crewJobsSet.has(job)) {
        existing.crewJobsSet.add(job);
        existing.crewJobs.push(job);
      }
      map.set(tmdbId, existing);
    }

    for (const c of credits.cast ?? []) {
      const tmdbId = Number((c as CreditPerson).tmdb_id ?? (c as CreditPerson).id);
      const name =
        typeof (c as CreditPerson).name === "string"
          ? String((c as CreditPerson).name)
          : "";
      if (!tmdbId || !name) continue;
      const character =
        typeof (c as CreditPerson).character === "string" &&
        String((c as CreditPerson).character).trim()
          ? String((c as CreditPerson).character).trim()
          : "";
      const existing = map.get(tmdbId) ?? {
        name,
        crewJobs: [],
        crewJobsSet: new Set<string>(),
        characters: [],
        characterSet: new Set<string>(),
        isCast: false
      };
      existing.isCast = true;
      if (character && !existing.characterSet.has(character)) {
        existing.characterSet.add(character);
        existing.characters.push(character);
      }
      map.set(tmdbId, existing);
    }

    return map;
  }, [filmCredits]);

  const creditOptions = useMemo(() => {
    const opts: Array<{ tmdb_id: number; name: string; label: string; search: string }> =
      [];
    for (const [tmdbId, info] of creditByPersonId.entries()) {
      const jobs: string[] = [];
      for (const j of info.crewJobs) jobs.push(j);
      if (info.isCast) {
        const role = info.characters.length ? ` (as ${info.characters.join(" / ")})` : "";
        jobs.push(`Cast${role}`);
      }
      const label = `${info.name} -- ${jobs.join(", ")}`;
      opts.push({
        tmdb_id: tmdbId,
        name: info.name,
        label,
        search: normalizeForSearch(`${info.name} ${jobs.join(" ")}`)
      });
    }
    return opts.sort((a, b) => a.name.localeCompare(b.name));
  }, [creditByPersonId]);

  const contributorComboboxOptions = useMemo<ContributorOption[]>(() => {
    const q = normalizeForSearch(pendingContributorInput);
    const fromCredits =
      creditOptions.length > 0
        ? creditOptions
            .filter((c) => (q ? c.search.includes(q) : true))
            .slice(0, 50)
            .map((c) => ({
              kind: "tmdb" as const,
              value: `tmdb:${c.tmdb_id}`,
              label: c.label,
              name: c.name,
              tmdb_id: c.tmdb_id
            }))
        : [];
    const fromPeople =
      creditOptions.length === 0
        ? people
            .filter((p) => (q ? normalizeForSearch(p.full_name).includes(q) : true))
            .slice(0, 50)
            .map((p) => ({
              kind: "person" as const,
              value: `person:${p.id}`,
              label: p.full_name,
              name: p.full_name,
              person_id: p.id
            }))
        : [];
    const base = [...fromCredits, ...fromPeople];
    const exact = q ? base.some((o) => normalizeForSearch(o.name) === q) : true;
    const create =
      q && !exact
        ? [
            {
              kind: "create" as const,
              value: `create:${pendingContributorInput.trim()}`,
              label: `Create person: ${pendingContributorInput.trim()}`,
              name: pendingContributorInput.trim()
            }
          ]
        : [];
    return [...create, ...base];
  }, [creditOptions, pendingContributorInput, people]);

  return (
    <Box>
      <Text fw="var(--fo-font-weight-bold)">People</Text>
      <Text className="muted" size="xs">
        Changes here apply only to this nomination.
      </Text>

      {contributorRows.length === 0 ? (
        <Text className="muted" size="sm" mt="xs">
          No contributors yet.
        </Text>
      ) : (
        <Stack gap="var(--fo-space-4)" mt="xs">
          {contributorRows.map((c) => (
            <Group
              key={`${c.person_id}:${c.nomination_contributor_id ?? "?"}`}
              justify="space-between"
              wrap="nowrap"
            >
              <Box className="fo-minw0">
                <Group gap="var(--fo-space-8)" wrap="nowrap">
                  <Text fw="var(--fo-font-weight-bold)" size="sm" lineClamp={1}>
                    {c.full_name}
                  </Text>
                  {!c.tmdb_id ? (
                    <Text
                      component="span"
                      className="gicon muted"
                      aria-label="Contributor not linked to TMDB"
                    >
                      link_off
                    </Text>
                  ) : null}
                  {c.role_label ? (
                    <Text className="muted" size="xs" lineClamp={1}>
                      ({c.role_label})
                    </Text>
                  ) : null}
                </Group>
              </Box>

              <Group gap="xs" wrap="nowrap">
                <ActionIcon
                  variant="subtle"
                  aria-label="Link contributor to TMDB"
                  onClick={() => {
                    setPersonLinkOpenId((prev) =>
                      prev === c.person_id ? null : c.person_id
                    );
                    setPersonTmdbId(c.tmdb_id ? String(c.tmdb_id) : "");
                  }}
                >
                  <Text component="span" className="gicon" aria-hidden="true">
                    add_link
                  </Text>
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  aria-label="Remove contributor"
                  onClick={() => {
                    if (!c.nomination_contributor_id) return;
                    void onRemoveContributor(nominationId, c.nomination_contributor_id);
                  }}
                >
                  <Text component="span" className="gicon" aria-hidden="true">
                    {String.fromCharCode(0xe872)}
                  </Text>
                </ActionIcon>
              </Group>
            </Group>
          ))}
        </Stack>
      )}

      {personLinkOpenId ? (
        <Group mt="xs" align="flex-end" wrap="wrap">
          <TextInput
            label="TMDB person id"
            value={personTmdbId}
            onChange={(e) => setPersonTmdbId(e.currentTarget.value)}
            placeholder="6384"
          />
          {contributors.some(
            (c) => c.person_id === personLinkOpenId && Boolean(c.tmdb_id)
          ) ? (
            <ActionIcon
              variant="subtle"
              aria-label="Remove TMDB link"
              onClick={() =>
                void (async () => {
                  const r = await onLinkPerson(personLinkOpenId, null);
                  if (r.ok) {
                    notify({
                      id: "admin.nominees.person.unlink.success",
                      severity: "success",
                      trigger_type: "user_action",
                      scope: "local",
                      durability: "ephemeral",
                      requires_decision: false,
                      title: "Contributor unlinked",
                      message: "Removed TMDB link."
                    });
                    setPersonLinkOpenId(null);
                    setPersonTmdbId("");
                  } else {
                    notify({
                      id: "admin.nominees.person.unlink.error",
                      severity: "error",
                      trigger_type: "user_action",
                      scope: "local",
                      durability: "ephemeral",
                      requires_decision: false,
                      title: "Could not unlink contributor",
                      message: r.error
                    });
                  }
                })()
              }
            >
              <Text component="span" className="gicon" aria-hidden="true">
                link_off
              </Text>
            </ActionIcon>
          ) : null}
          <Button
            type="button"
            onClick={() =>
              void (async () => {
                const nextTmdbId = personTmdbId.trim()
                  ? Number(personTmdbId.trim())
                  : null;
                const r = await onLinkPerson(personLinkOpenId, nextTmdbId);
                if (r.ok) {
                  notify({
                    id: "admin.nominees.person.link.success",
                    severity: "success",
                    trigger_type: "user_action",
                    scope: "local",
                    durability: "ephemeral",
                    requires_decision: false,
                    title: nextTmdbId ? "Contributor linked" : "Contributor unlinked",
                    message: nextTmdbId
                      ? r.hydrated
                        ? "Hydrated details from TMDB."
                        : "Linked."
                      : "Unlinked."
                  });
                  setPersonLinkOpenId(null);
                  setPersonTmdbId("");
                  return;
                }
                notify({
                  id: "admin.nominees.person.link.error",
                  severity: "error",
                  trigger_type: "user_action",
                  scope: "local",
                  durability: "ephemeral",
                  requires_decision: false,
                  title: nextTmdbId
                    ? "Could not link contributor"
                    : "Could not unlink contributor",
                  message: r.error
                });
              })()
            }
          >
            Save
          </Button>
        </Group>
      ) : null}

      <Group mt="sm" align="flex-end" wrap="wrap">
        <Box className="fo-flexFieldMd">
          <ContributorCombobox
            label="Add contributor"
            value={pendingContributorInput}
            onChange={setPendingContributorInput}
            options={contributorComboboxOptions}
            disabled={peopleLoading}
            onSubmit={async (picked) => {
              if (picked.kind === "tmdb") {
                await onAddContributor(nominationId, {
                  tmdb_id: picked.tmdb_id,
                  name: picked.name
                });
              } else if (picked.kind === "person") {
                await onAddContributor(nominationId, { person_id: picked.person_id });
              } else if (picked.kind === "create") {
                await onAddContributor(nominationId, { name: picked.name });
              }
              setPendingContributorInput("");
            }}
          />
        </Box>
        <Button
          type="button"
          variant="subtle"
          onClick={() => {
            if (pendingContributorInput.trim()) {
              void onAddContributor(nominationId, {
                name: pendingContributorInput.trim()
              });
              setPendingContributorInput("");
            }
          }}
          disabled={!pendingContributorInput.trim()}
        >
          Add
        </Button>
      </Group>
    </Box>
  );
}
