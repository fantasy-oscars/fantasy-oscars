import { ActionIcon, Box, Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { normalizeForSearch } from "@fantasy-oscars/shared";
import { notify } from "../../../../notifications";
import { ContributorCombobox, type ContributorOption } from "./ContributorCombobox";

export function NominationEditModal(props: {
  nomination: null | {
    id: number;
    display_film_id?: number | null;
    film_title?: string | null;
    contributors?: Array<{
      nomination_contributor_id?: number;
      person_id: number;
      full_name: string;
      tmdb_id?: number | null;
      role_label: string | null;
      sort_order: number;
    }>;
  };
  films: Array<{
    id: number;
    title: string;
    tmdb_id?: number | null;
    release_year?: number | null;
  }>;
  people: Array<{ id: number; full_name: string; tmdb_id: number | null }>;
  peopleLoading: boolean;
  onClose: () => void;
  onLinkFilm: (
    filmId: number,
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
  getFilmCredits: (filmId: number) => Promise<unknown | null>;
}) {
  const {
    nomination,
    films,
    people,
    peopleLoading,
    onClose,
    onLinkFilm,
    onLinkPerson,
    onAddContributor,
    onRemoveContributor,
    getFilmCredits
  } = props;

  type CreditPerson = {
    tmdb_id?: number;
    id?: number;
    name?: string;
    character?: string | null;
    job?: string | null;
    department?: string | null;
    profile_path?: string | null;
    credit_id?: string | null;
  };
  type FilmCredits = { cast?: CreditPerson[]; crew?: CreditPerson[] };

  const [filmLinkOpen, setFilmLinkOpen] = useState(false);
  const [filmTmdbId, setFilmTmdbId] = useState("");

  const [personLinkOpenId, setPersonLinkOpenId] = useState<number | null>(null);
  const [personTmdbId, setPersonTmdbId] = useState("");

  const [pendingContributorInput, setPendingContributorInput] = useState("");

  const [filmCredits, setFilmCredits] = useState<FilmCredits | null>(null);
  const [filmLinkConflict, setFilmLinkConflict] = useState<{
    tmdbId: number;
    linkedFilmId: number;
    linkedFilmTitle: string | null;
  } | null>(null);

  const filmId = nomination?.display_film_id ?? null;
  const film = filmId ? (films.find((f) => f.id === filmId) ?? null) : null;
  const filmLinked = Boolean(film?.tmdb_id);

  const contributorRows = useMemo(() => {
    return (nomination?.contributors ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [nomination?.contributors]);

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
      const tmdbId = Number(c.tmdb_id ?? c.id);
      const name = typeof c.name === "string" ? String(c.name) : "";
      if (!tmdbId || !name) continue;
      const job =
        typeof c.job === "string" && String(c.job).trim()
          ? String(c.job).trim()
          : typeof c.department === "string" && String(c.department).trim()
            ? String(c.department).trim()
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
      const tmdbId = Number(c.tmdb_id ?? c.id);
      const name = typeof c.name === "string" ? String(c.name) : "";
      if (!tmdbId || !name) continue;
      const character =
        typeof c.character === "string" && String(c.character).trim()
          ? String(c.character).trim()
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

  useEffect(() => {
    // When the film becomes TMDB-linked, load credits so the contributor dropdown can use cast/crew.
    if (!filmId) {
      setFilmCredits(null);
      return;
    }
    void (async () => {
      const creditsUnknown = await getFilmCredits(filmId);
      if (!creditsUnknown) {
        setFilmCredits(null);
        return;
      }
      const creditsObj = creditsUnknown as { cast?: unknown; crew?: unknown };
      const cast = Array.isArray(creditsObj.cast)
        ? (creditsObj.cast as CreditPerson[])
        : undefined;
      const crew = Array.isArray(creditsObj.crew)
        ? (creditsObj.crew as CreditPerson[])
        : undefined;
      setFilmCredits({ cast, crew });
    })();
  }, [filmId, filmLinked, getFilmCredits]);

  if (!nomination) return null;

  return (
    <Modal
      opened
      onClose={onClose}
      title="Edit nomination"
      centered
      size="lg"
      overlayProps={{ opacity: 0.35, blur: 2 }}
    >
      <Stack gap="sm">
        <Box>
          <Group justify="space-between" align="center" wrap="nowrap">
            <Text fw={700}>Film</Text>
            {filmId ? (
              <Group gap="xs" wrap="nowrap">
                {!filmLinked ? (
                  <Text
                    component="span"
                    className="gicon muted"
                    aria-label="Film not linked to TMDB"
                  >
                    link_off
                  </Text>
                ) : null}
                <ActionIcon
                  variant="subtle"
                  aria-label="Link film to TMDB"
                  onClick={() => {
                    setFilmLinkOpen((v) => !v);
                    setFilmTmdbId(film?.tmdb_id ? String(film.tmdb_id) : "");
                  }}
                >
                  <Text component="span" className="gicon" aria-hidden="true">
                    add_link
                  </Text>
                </ActionIcon>
              </Group>
            ) : null}
          </Group>
          <Text className="muted" size="sm">
            {film ? film.title : (nomination.film_title ?? "—")}
          </Text>
          <Text className="muted" size="xs">
            Changes here affect every nomination that references this film.
          </Text>

          {filmId && filmLinkOpen ? (
            <Group mt="xs" align="flex-end" wrap="wrap">
              <TextInput
                label="TMDB id"
                value={filmTmdbId}
                onChange={(e) => setFilmTmdbId(e.currentTarget.value)}
                placeholder="603"
              />
              {film?.tmdb_id ? (
                <ActionIcon
                  variant="subtle"
                  aria-label="Remove TMDB link"
                  onClick={() =>
                    void (async () => {
                      const r = await onLinkFilm(filmId, null);
                      if (r.ok) {
                        notify({
                          id: "admin.nominees.film.unlink.success",
                          severity: "success",
                          trigger_type: "user_action",
                          scope: "local",
                          durability: "ephemeral",
                          requires_decision: false,
                          title: "Film unlinked",
                          message: "Removed TMDB link."
                        });
                        setFilmLinkOpen(false);
                        setFilmTmdbId("");
                      } else {
                        notify({
                          id: "admin.nominees.film.unlink.error",
                          severity: "error",
                          trigger_type: "user_action",
                          scope: "local",
                          durability: "ephemeral",
                          requires_decision: false,
                          title: "Could not unlink film",
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
                    const nextTmdbId = filmTmdbId.trim()
                      ? Number(filmTmdbId.trim())
                      : null;
                    const r = await onLinkFilm(filmId, nextTmdbId);
                    if (r.ok) {
                      notify({
                        id: "admin.nominees.film.link.success",
                        severity: "success",
                        trigger_type: "user_action",
                        scope: "local",
                        durability: "ephemeral",
                        requires_decision: false,
                        title: nextTmdbId ? "Film linked" : "Film unlinked",
                        message: nextTmdbId
                          ? r.hydrated
                            ? "Hydrated details from TMDB."
                            : "Linked."
                          : "Unlinked."
                      });
                      setFilmLinkOpen(false);
                      setFilmTmdbId("");
                      return;
                    }

                    if (
                      nextTmdbId &&
                      r.errorCode === "TMDB_ID_ALREADY_LINKED" &&
                      r.errorDetails &&
                      typeof r.errorDetails.linked_film_id === "number"
                    ) {
                      setFilmLinkConflict({
                        tmdbId: nextTmdbId,
                        linkedFilmId: r.errorDetails.linked_film_id,
                        linkedFilmTitle:
                          typeof r.errorDetails.linked_film_title === "string"
                            ? r.errorDetails.linked_film_title
                            : null
                      });
                      return;
                    }

                    notify({
                      id: "admin.nominees.film.link.error",
                      severity: "error",
                      trigger_type: "user_action",
                      scope: "local",
                      durability: "ephemeral",
                      requires_decision: false,
                      title: nextTmdbId ? "Could not link film" : "Could not unlink film",
                      message: r.error
                    });
                  })()
                }
              >
                Save
              </Button>
            </Group>
          ) : null}
        </Box>

        <Modal
          opened={Boolean(filmId) && Boolean(filmLinkConflict)}
          onClose={() => setFilmLinkConflict(null)}
          title="TMDB id already linked"
          centered
          size="md"
          overlayProps={{ opacity: 0.45, blur: 2 }}
        >
          <Stack gap="sm">
            <Text size="sm">
              {filmLinkConflict?.linkedFilmTitle
                ? `That TMDB id is already linked to “${filmLinkConflict.linkedFilmTitle}”.`
                : "That TMDB id is already linked to another film."}
            </Text>
            <Text size="sm" className="muted">
              If it was linked to the wrong film, you can remove it there and link it
              here.
            </Text>
            <Group justify="flex-end">
              <Button variant="subtle" onClick={() => setFilmLinkConflict(null)}>
                Cancel
              </Button>
              <Button
                onClick={() =>
                  void (async () => {
                    if (!filmId || !filmLinkConflict) return;
                    const { tmdbId, linkedFilmId } = filmLinkConflict;
                    const unlink = await onLinkFilm(linkedFilmId, null);
                    if (!unlink.ok) {
                      notify({
                        id: "admin.nominees.film.unlink.other.error",
                        severity: "error",
                        trigger_type: "user_action",
                        scope: "local",
                        durability: "ephemeral",
                        requires_decision: false,
                        title: "Could not remove link",
                        message: unlink.error
                      });
                      return;
                    }
                    const link = await onLinkFilm(filmId, tmdbId);
                    if (!link.ok) {
                      notify({
                        id: "admin.nominees.film.link.after-unlink.error",
                        severity: "error",
                        trigger_type: "user_action",
                        scope: "local",
                        durability: "ephemeral",
                        requires_decision: false,
                        title: "Could not link film",
                        message: link.error
                      });
                      return;
                    }
                    notify({
                      id: "admin.nominees.film.link.after-unlink.success",
                      severity: "success",
                      trigger_type: "user_action",
                      scope: "local",
                      durability: "ephemeral",
                      requires_decision: false,
                      title: "Film linked",
                      message: link.hydrated ? "Hydrated details from TMDB." : "Linked."
                    });
                    setFilmLinkConflict(null);
                    setFilmLinkOpen(false);
                    setFilmTmdbId("");
                  })()
                }
              >
                Remove &amp; link
              </Button>
            </Group>
          </Stack>
        </Modal>

        <Box>
          <Text fw={700}>People</Text>
          <Text className="muted" size="xs">
            Changes here apply only to this nomination.
          </Text>

          {contributorRows.length === 0 ? (
            <Text className="muted" size="sm" mt="xs">
              No contributors yet.
            </Text>
          ) : (
            <Stack gap={4} mt="xs">
              {contributorRows.map((c) => (
                <Group
                  key={`${c.person_id}:${c.nomination_contributor_id ?? "?"}`}
                  justify="space-between"
                  wrap="nowrap"
                >
                  <Box style={{ minWidth: 0 }}>
                    <Group gap={6} wrap="nowrap">
                      <Text fw={700} size="sm" lineClamp={1}>
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
                        void onRemoveContributor(
                          nomination.id,
                          c.nomination_contributor_id
                        );
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
              {(nomination.contributors ?? []).some(
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
            <Box style={{ flex: "1 1 360px", minWidth: 240 }}>
              <ContributorCombobox
                label="Add contributor"
                value={pendingContributorInput}
                onChange={setPendingContributorInput}
                options={contributorComboboxOptions}
                disabled={peopleLoading}
                onSubmit={async (picked) => {
                  if (picked.kind === "tmdb") {
                    await onAddContributor(nomination.id, {
                      tmdb_id: picked.tmdb_id,
                      name: picked.name
                    });
                  } else if (picked.kind === "person") {
                    await onAddContributor(nomination.id, {
                      person_id: picked.person_id
                    });
                  } else if (picked.kind === "create") {
                    await onAddContributor(nomination.id, { name: picked.name });
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
                  void onAddContributor(nomination.id, {
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
      </Stack>
    </Modal>
  );
}
