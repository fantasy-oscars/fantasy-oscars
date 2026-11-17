import {
  Alert,
  Box,
  Button,
  Group,
  Loader,
  Select,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
  TmdbLogo,
  UnstyledButton
} from "@ui";
import { AlertIcon } from "@/shared/AlertIcon";
import {
  contenderFilmLabel,
  type ContenderCategory,
  type ContenderFilm,
  type ContenderPerson,
  type ContenderPickerStep
} from "@/decisions/contenders";
import type { ContenderSelection } from "@/orchestration/contenders";

type LoadState = "idle" | "loading" | "error" | "ready";

export type ContenderPickerProps = {
  categoriesState: "loading" | "error" | "ready" | "idle";
  categoriesError: string | null;
  categories: ContenderCategory[];
  step: ContenderPickerStep;
  category: ContenderCategory | null;
  film: ContenderFilm | null;
  person: ContenderPerson | null;
  search: {
    query: string;
    hint: string | null;
    state: LoadState;
    error: string | null;
    results: ContenderFilm[];
  };
  credits: {
    state: LoadState;
    error: string | null;
    people: ContenderPerson[];
    total: number;
    filter: string;
  };
  picking: boolean;
  /** The confirm button's verb, as in "Draft Sunset Boulevard"; "Pick" by default. */
  confirmVerb?: string;
  pickError: string | null;
  picked: ContenderSelection | null;
  actions: {
    selectCategory: (id: number | null) => void;
    setQuery: (q: string) => void;
    selectFilm: (film: ContenderFilm) => void;
    changeFilm: () => void;
    setPeopleFilter: (q: string) => void;
    selectPerson: (person: ContenderPerson) => void;
    changePerson: () => void;
    retryCredits: () => void;
    pick: () => void;
    startOver: () => void;
  };
};

function TmdbAttribution() {
  return (
    <Group gap="xs" wrap="nowrap" className="contender-picker-attribution">
      <TmdbLogo className="contender-picker-tmdbLogo" />
      <Text size="xs" c="dimmed">
        Film data from TMDB. This product uses the TMDB API but is not endorsed or
        certified by TMDB.
      </Text>
    </Group>
  );
}

function ErrorAlert(props: { message: string }) {
  return (
    <Alert
      color="red"
      variant="light"
      icon={<AlertIcon variant="error" />}
      role="alert"
      aria-live="assertive"
    >
      {props.message}
    </Alert>
  );
}

function Thumb(props: { src: string | null }) {
  return props.src ? (
    <img className="contender-picker-thumb" src={props.src} alt="" loading="lazy" />
  ) : (
    <Box className="contender-picker-thumb contender-picker-thumb-empty" aria-hidden />
  );
}

function ChosenRow(props: {
  label: string;
  value: string;
  thumb: string | null;
  changeLabel: string;
  onChange: () => void;
}) {
  return (
    <Group justify="space-between" wrap="nowrap" className="contender-picker-chosen">
      <Group gap="sm" wrap="nowrap">
        <Thumb src={props.thumb} />
        <Stack gap="var(--fo-space-0)">
          <Text size="xs" c="dimmed">
            {props.label}
          </Text>
          <Text fw="var(--fo-font-weight-semibold)">{props.value}</Text>
        </Stack>
      </Group>
      <Button variant="subtle" onClick={props.onChange} aria-label={props.changeLabel}>
        Change
      </Button>
    </Group>
  );
}

function FilmStep(props: ContenderPickerProps) {
  const { film, search, actions } = props;
  if (film) {
    return (
      <ChosenRow
        label="Film"
        value={contenderFilmLabel(film)}
        thumb={film.poster_url}
        changeLabel="Change film"
        onChange={actions.changeFilm}
      />
    );
  }
  return (
    <Stack gap="xs">
      <TextInput
        label="Search films"
        placeholder="Film title"
        value={search.query}
        onChange={(e) => actions.setQuery(e.currentTarget.value)}
        description={search.hint ?? undefined}
        rightSection={search.state === "loading" ? <Loader size="xs" /> : null}
        autoFocus
        autoComplete="off"
      />
      {search.state === "error" && search.error ? (
        <ErrorAlert message={search.error} />
      ) : null}
      {search.state === "ready" ? (
        search.results.length === 0 ? (
          <Text c="dimmed" role="status">
            No films match that search.
          </Text>
        ) : (
          <Box component="ul" className="contender-picker-list" aria-label="Films">
            {search.results.map((r) => (
              <li key={r.tmdb_id}>
                <UnstyledButton
                  className="contender-picker-option"
                  onClick={() => actions.selectFilm(r)}
                >
                  <Thumb src={r.poster_url} />
                  <Text component="span">{contenderFilmLabel(r)}</Text>
                </UnstyledButton>
              </li>
            ))}
          </Box>
        )
      ) : null}
      {search.state === "ready" && search.results.length > 0 ? <TmdbAttribution /> : null}
    </Stack>
  );
}

function PersonStep(props: ContenderPickerProps) {
  const { person, credits, actions } = props;
  if (person) {
    return (
      <ChosenRow
        label="Person"
        value={person.name}
        thumb={person.profile_url}
        changeLabel="Change person"
        onChange={actions.changePerson}
      />
    );
  }
  if (credits.state === "loading" || credits.state === "idle") {
    return (
      <Stack gap="xs" aria-busy="true">
        <Skeleton height="var(--fo-control-height)" />
        <Skeleton height="120px" />
      </Stack>
    );
  }
  if (credits.state === "error") {
    return (
      <Stack gap="xs">
        <ErrorAlert message={credits.error ?? "Could not load the credits."} />
        <Group>
          <Button variant="default" onClick={actions.retryCredits}>
            Try again
          </Button>
        </Group>
      </Stack>
    );
  }
  return (
    <Stack gap="xs">
      <TextInput
        label="Find a person in the credits"
        placeholder="Name or role"
        value={credits.filter}
        onChange={(e) => actions.setPeopleFilter(e.currentTarget.value)}
        autoFocus
        autoComplete="off"
      />
      {credits.total === 0 ? (
        <Text c="dimmed" role="status">
          TMDB lists no credits for this film yet.
        </Text>
      ) : credits.people.length === 0 ? (
        <Text c="dimmed" role="status">
          No one in the credits matches.
        </Text>
      ) : (
        <Box component="ul" className="contender-picker-list" aria-label="People">
          {credits.people.map((p) => (
            <li key={p.tmdb_id}>
              <UnstyledButton
                className="contender-picker-option"
                onClick={() => actions.selectPerson(p)}
              >
                <Thumb src={p.profile_url} />
                <Stack gap="var(--fo-space-0)" component="span">
                  <Text component="span">{p.name}</Text>
                  {p.role ? (
                    <Text component="span" size="sm" c="dimmed">
                      {p.role}
                    </Text>
                  ) : null}
                </Stack>
              </UnstyledButton>
            </li>
          ))}
        </Box>
      )}
      <TmdbAttribution />
    </Stack>
  );
}

function ConfirmStep(props: ContenderPickerProps) {
  const { category, film, person, picking, pickError, picked, actions } = props;
  if (!category || !film) return null;
  if (picked) {
    return (
      <Stack gap="xs">
        <Box className="status status-success" role="status">
          Picked {picked.person ? `${picked.person.name}, ` : ""}
          {contenderFilmLabel(picked.film)} for {category.name}.
        </Box>
        <Group>
          <Button variant="default" onClick={actions.startOver} autoFocus>
            Pick another
          </Button>
        </Group>
      </Stack>
    );
  }
  return (
    <Stack gap="xs">
      <Group>
        <Button onClick={actions.pick} loading={picking} autoFocus>
          {props.confirmVerb ?? "Pick"} {person ? person.name : film.title}
        </Button>
      </Group>
      {pickError ? <ErrorAlert message={pickError} /> : null}
    </Stack>
  );
}

/**
 * Category, then film, then person for acting categories. Every control is a
 * native button, input or select, so the picker works by keyboard alone.
 */
export function ContenderPicker(props: ContenderPickerProps) {
  const { categoriesState, categoriesError, categories, category, step, actions } = props;

  if (categoriesState === "loading" || categoriesState === "idle") {
    return (
      <Stack gap="xs" aria-busy="true">
        <Skeleton height="var(--fo-control-height)" />
      </Stack>
    );
  }
  if (categoriesState === "error") {
    return <ErrorAlert message={categoriesError ?? "Could not load categories."} />;
  }
  if (categories.length === 0) {
    return <Text c="dimmed">This season has no categories yet.</Text>;
  }

  return (
    <Stack gap="md" className="contender-picker">
      <Select
        label="Category"
        placeholder="Choose a category"
        data={categories.map((c) => ({ value: String(c.id), label: c.name }))}
        value={category ? String(category.id) : null}
        onChange={(v) => actions.selectCategory(v ? Number(v) : null)}
        allowDeselect={false}
      />
      {category ? (
        <Stack gap="xs" component="section" aria-label="Film">
          <Title order={3} variant="section">
            Film
          </Title>
          <FilmStep {...props} />
        </Stack>
      ) : null}
      {category?.kind === "ACTING" && props.film ? (
        <Stack gap="xs" component="section" aria-label="Person">
          <Title order={3} variant="section">
            Person
          </Title>
          <PersonStep {...props} />
        </Stack>
      ) : null}
      {step === "confirm" ? <ConfirmStep {...props} /> : null}
    </Stack>
  );
}
