import { formatFilmTitleWithYear } from "../../../lib/films";
import {
  Autocomplete,
  Box,
  Button,
  Card,
  FileInput,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import type { AdminCeremonyNomineesOrchestration } from "../../../orchestration/adminCeremoniesNominees";
import { FormStatus } from "../../../ui/forms";

export function AdminCeremoniesNomineesScreen(props: {
  o: AdminCeremonyNomineesOrchestration;
}) {
  const { o } = props;

  const {
    tab,
    setTab,
    candidateUploading,
    candidateUploadState,
    candidateSummaryView,
    manualLoading,
    manualState,
    categories,
    films,
    nominations,
    nominationsLoading,
    selectedCategoryId,
    setSelectedCategoryId,
    selectedCategory,
    filmInput,
    songTitle,
    setSongTitle,
    creditsLoading,
    creditsState,
    creditOptions,
    creditQuery,
    setCreditQuery,
    filteredCreditOptions,
    selectedContributorIds,
    setSelectedContributorIds,
    pendingContributorId,
    setPendingContributorId,
    selectedCredits,
    categoryLabelById
  } = o;

  const {
    resetCandidates,
    resetManual,
    resolveFilmSelection,
    uploadCandidateFilms,
    createNomination,
    deleteNomination
  } = o.actions;

  return (
    <Stack className="stack-lg" mt="md" gap="lg">
      <Card className="card nested" component="section">
        <Group
          className="header-with-controls"
          justify="space-between"
          align="start"
          wrap="wrap"
        >
          <Box>
            <Title order={3}>Nominees</Title>
            <Text className="muted">
              Candidates, nomination entry, and current nominee list for this ceremony.
            </Text>
          </Box>
          <Group className="inline-actions" wrap="wrap">
            <Button
              type="button"
              variant={tab === "candidates" ? "default" : "subtle"}
              onClick={() => setTab("candidates")}
            >
              Candidates
            </Button>
            <Button
              type="button"
              variant={tab === "add" ? "default" : "subtle"}
              onClick={() => setTab("add")}
            >
              Add nominees
            </Button>
            <Button
              type="button"
              variant={tab === "list" ? "default" : "subtle"}
              onClick={() => setTab("list")}
            >
              Nominee list
            </Button>
          </Group>
        </Group>
      </Card>

      {tab === "candidates" && (
        <Card className="card nested" component="section">
          <Group
            className="header-with-controls"
            justify="space-between"
            align="start"
            wrap="wrap"
          >
            <Box>
              <Title order={3}>Candidate films (TMDB import)</Title>
              <Text className="muted">
                Seed an internal list of films/candidates (draft only). This does not
                require a nominees dataset.
              </Text>
            </Box>
            <Box component="span" className="pill">
              JSON only
            </Box>
          </Group>

          <Stack className="stack-sm" gap="sm">
            <FileInput
              label="Candidate films JSON file"
              accept="application/json"
              onChange={(file) => o.actions.onCandidateFile(file)}
              disabled={candidateUploading}
              placeholder="Choose file…"
            />

            <Box className="status status-info" role="status">
              {candidateSummaryView}
            </Box>

            <Group className="inline-actions" wrap="wrap">
              <Button
                type="button"
                onClick={() => void uploadCandidateFilms()}
                disabled={candidateUploading}
              >
                {candidateUploading ? "Importing..." : "Import candidate films"}
              </Button>
              <Button
                type="button"
                variant="subtle"
                onClick={resetCandidates}
                disabled={candidateUploading}
              >
                Reset
              </Button>
            </Group>

            <FormStatus loading={candidateUploading} result={candidateUploadState} />
          </Stack>
        </Card>
      )}

      {tab === "add" && (
        <Card className="card nested" component="section">
          <Group
            className="header-with-controls"
            justify="space-between"
            align="start"
            wrap="wrap"
          >
            <Box>
              <Title order={3}>Add nominees</Title>
              <Text className="muted">
                Create nominations one by one. Select category, film, then (optionally)
                contributors pulled from TMDB credits.
              </Text>
            </Box>
            <Box component="span" className="pill">
              Manual
            </Box>
          </Group>

          <Stack className="stack-sm" gap="sm">
            <Box className="grid two-col">
              <Select
                label="Category"
                placeholder="Select..."
                value={selectedCategoryId ? String(selectedCategoryId) : null}
                onChange={(v) => setSelectedCategoryId(v ? Number(v) : null)}
                data={categories.map((c) => ({
                  value: String(c.id),
                  label: c.family_name ?? `Category ${c.id}`
                }))}
              />

              <Autocomplete
                label="Film (type to search)"
                value={filmInput}
                onChange={(v) => void resolveFilmSelection(v)}
                placeholder="Type film title or id..."
                data={films.map((f) => formatFilmTitleWithYear(f.title, f.release_year))}
              />
            </Box>

            {selectedCategory?.unit_kind === "SONG" && (
              <TextInput
                label="Song title"
                value={songTitle}
                onChange={(e) => setSongTitle(e.currentTarget.value)}
              />
            )}

            <Card className="card nested" component="section">
              <Group
                className="header-with-controls"
                justify="space-between"
                align="start"
                wrap="wrap"
              >
                <Box>
                  <Title order={4}>Contributors</Title>
                  <Text className="muted">
                    Select from this film&apos;s stored TMDB credits. (People details are
                    not hydrated until needed.)
                  </Text>
                </Box>
                {selectedCategory?.unit_kind === "PERFORMANCE" ? (
                  <Box component="span" className="pill">
                    Pick 1+
                  </Box>
                ) : (
                  <Box component="span" className="pill">
                    Optional
                  </Box>
                )}
              </Group>

              <Stack className="stack-sm" gap="sm">
                <FormStatus loading={creditsLoading} result={creditsState} />

                {creditOptions.length > 0 ? (
                  <Stack className="stack-sm" gap="sm">
                    <TextInput
                      label="Search credits"
                      value={creditQuery}
                      onChange={(e) => setCreditQuery(e.currentTarget.value)}
                      placeholder="Type a name, character, job..."
                    />

                    <Select
                      label="Find a person"
                      placeholder="Select…"
                      searchable
                      value={pendingContributorId || null}
                      onChange={(v) => setPendingContributorId(v ?? "")}
                      data={filteredCreditOptions.map((o) => ({
                        value: String(o.tmdb_id),
                        label: o.label
                      }))}
                    />

                    <Group className="inline-actions" wrap="wrap">
                      <Button
                        type="button"
                        onClick={() => {
                          const id = Number(pendingContributorId);
                          if (!Number.isFinite(id) || id <= 0) return;
                          setSelectedContributorIds((prev) =>
                            prev.includes(id) ? prev : [...prev, id]
                          );
                          setPendingContributorId("");
                        }}
                        disabled={!pendingContributorId}
                      >
                        Add person
                      </Button>
                      <Button
                        type="button"
                        variant="subtle"
                        onClick={() => {
                          setSelectedContributorIds([]);
                          setPendingContributorId("");
                        }}
                        disabled={selectedContributorIds.length === 0}
                      >
                        Clear
                      </Button>
                    </Group>

                    <Stack className="stack-sm" gap="xs">
                      <Text className="muted">Selected people</Text>
                      {selectedCredits.length === 0 ? (
                        <Text className="muted">None yet.</Text>
                      ) : (
                        <Stack className="stack-sm" gap="xs">
                          {selectedCredits.map((c) => (
                            <Box key={c.tmdb_id} className="list-row">
                              <Box>
                                <Text fw={700} span>
                                  {c.name}
                                </Text>
                                <Text className="muted" span>
                                  {" "}
                                  — {c.jobs.join(", ")}
                                </Text>
                              </Box>
                              <Group className="inline-actions" wrap="wrap">
                                <Button
                                  type="button"
                                  variant="subtle"
                                  onClick={() =>
                                    setSelectedContributorIds((prev) =>
                                      prev.filter((id) => id !== c.tmdb_id)
                                    )
                                  }
                                >
                                  Remove
                                </Button>
                              </Group>
                            </Box>
                          ))}
                        </Stack>
                      )}
                    </Stack>
                  </Stack>
                ) : (
                  <Text className="muted">
                    No credits loaded. Select a film with TMDB credits (or import
                    candidates with TMDB hydration enabled).
                  </Text>
                )}
              </Stack>
            </Card>

            <Group className="inline-actions" wrap="wrap">
              <Button
                type="button"
                onClick={() => void createNomination()}
                disabled={manualLoading}
              >
                {manualLoading ? "Saving..." : "Add nominee"}
              </Button>
              <Button
                type="button"
                variant="subtle"
                onClick={resetManual}
                disabled={manualLoading}
              >
                Reset
              </Button>
            </Group>

            <FormStatus loading={manualLoading} result={manualState} />
          </Stack>
        </Card>
      )}

      {tab === "list" && (
        <Card className="card nested" component="section">
          <Group
            className="header-with-controls"
            justify="space-between"
            align="start"
            wrap="wrap"
          >
            <Box>
              <Title order={3}>Nominee list</Title>
              <Text className="muted">Current nominations for this ceremony.</Text>
            </Box>
            <Box component="span" className="pill">
              {nominations.length} nominations
            </Box>
          </Group>

          <Stack className="stack-sm" gap="sm">
            {nominations.length === 0 ? (
              <Card className="empty-state">
                <Text fw={700}>No nominations yet.</Text>
                <Text className="muted" mt="xs">
                  Add nominees in the Add nominees tab.
                </Text>
              </Card>
            ) : (
              <Stack className="list">
                {nominations.map((n) => {
                  const category =
                    categoryLabelById[n.category_edition_id] ??
                    `Category ${n.category_edition_id}`;

                  const subject = n.song_title
                    ? n.song_title
                    : (n.film_title ?? `Nomination #${n.id}`);
                  const people = n.contributors?.length
                    ? n.contributors.map((c) => c.full_name).join(", ")
                    : (n.performer_name ?? null);

                  return (
                    <Box key={n.id} className="list-row">
                      <Box>
                        <Text className="eyebrow" size="xs">
                          {category}
                        </Text>
                        <Text fw={700}>{subject}</Text>
                        {n.song_title && n.film_title ? (
                          <Text className="muted">from {n.film_title}</Text>
                        ) : null}
                      </Box>
                      <Box>
                        {people ? (
                          <Text className="muted">{people}</Text>
                        ) : (
                          <Text className="muted">—</Text>
                        )}
                      </Box>
                      <Group className="inline-actions" wrap="wrap">
                        <Box component="span" className="pill">
                          #{n.id}
                        </Box>
                        <Button
                          type="button"
                          variant="subtle"
                          onClick={() => void deleteNomination(n.id)}
                          disabled={nominationsLoading}
                        >
                          Delete
                        </Button>
                      </Group>
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
