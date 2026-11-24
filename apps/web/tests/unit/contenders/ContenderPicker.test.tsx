import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { screen, waitFor } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@ui";
import { useContenderPickerOrchestration } from "@/orchestration/contenders";
import { ContenderPicker } from "@/features/contenders/ui/ContenderPicker";

type Reply = { status?: number; body: unknown };
type Route = (path: string, init?: RequestInit) => Reply | undefined;

const fetchMock = vi.fn();
let route: Route;

function reply({ status = 200, body }: Reply) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
}

const categories = [
  { id: 1, name: "Best Picture", kind: "FILM" },
  { id: 2, name: "Best Actor", kind: "ACTING" }
];

const films = [
  {
    tmdb_id: 238,
    title: "The Godfather",
    original_title: "The Godfather",
    release_date: "1972-03-14",
    release_year: 1972,
    poster_url: null
  },
  {
    tmdb_id: 9999001,
    title: "Untitled Future Film",
    original_title: null,
    release_date: null,
    release_year: null,
    poster_url: null
  }
];

const credits = {
  film: { tmdb_id: 238, title: "The Godfather" },
  cast: [
    {
      tmdb_id: 3084,
      name: "Marlon Brando",
      character: "Vito",
      order: 0,
      profile_url: null
    },
    {
      tmdb_id: 1158,
      name: "Al Pacino",
      character: "Michael",
      order: 1,
      profile_url: null
    }
  ],
  crew: [
    {
      tmdb_id: 1776,
      name: "Francis Ford Coppola",
      department: "Directing",
      job: "Director",
      profile_url: null
    }
  ]
};

function defaultRoute(path: string, init?: RequestInit): Reply | undefined {
  if (path.endsWith("/circuits/3/categories")) return { body: { categories } };
  if (path.includes("/contenders/films/search")) return { body: { results: films } };
  if (path.endsWith("/contenders/films/238/credits")) return { body: credits };
  if (path.endsWith("/contenders/selections") && init?.method === "POST") {
    const body = JSON.parse(String(init.body)) as {
      circuit_category_id: number;
      film_tmdb_id: number;
      person_tmdb_id: number | null;
    };
    const film = films.find((f) => f.tmdb_id === body.film_tmdb_id)!;
    const person = credits.cast.find((p) => p.tmdb_id === body.person_tmdb_id);
    return {
      status: 201,
      body: {
        selection: {
          id: 50,
          ...body,
          film: {
            id: 9,
            title: film.title,
            release_year: film.release_year,
            poster_url: null
          },
          person: person ? { id: 7, name: person.name, profile_url: null } : null
        }
      }
    };
  }
  return undefined;
}

function Harness(props: { onPicked?: (s: unknown) => void; circuitLeagueId?: number }) {
  const o = useContenderPickerOrchestration({
    circuitId: 3,
    circuitLeagueId: props.circuitLeagueId,
    onPicked: props.onPicked
  });
  return (
    <>
      <ContenderPicker {...o} />
      <span data-testid="owner">
        {o.owner === undefined ? "unknown" : (o.owner?.username ?? "free")}
      </span>
    </>
  );
}

function renderPicker(onPicked?: (s: unknown) => void, circuitLeagueId?: number) {
  return render(
    <MantineProvider>
      <Harness onPicked={onPicked} circuitLeagueId={circuitLeagueId} />
    </MantineProvider>
  );
}

function posts() {
  return fetchMock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === "POST")
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

async function chooseCategory(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole("textbox", { name: "Category" }));
  await user.click(await screen.findByRole("option", { name, hidden: true }));
}

beforeEach(() => {
  route = defaultRoute;
  fetchMock.mockImplementation((input: string, init?: RequestInit) => {
    const r = route(String(input), init);
    return r ? reply(r) : reply({ status: 404, body: { error: { code: "NOT_FOUND" } } });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("ContenderPicker", () => {
  it("picks a film-only contender, old or unreleased, by keyboard", async () => {
    const user = userEvent.setup();
    const onPicked = vi.fn();
    renderPicker(onPicked);
    (await screen.findByRole("textbox", { name: "Category" })).focus();
    await user.keyboard("{ArrowDown}{Enter}");

    // Choosing a category moves focus to the film search.
    const search = await screen.findByRole("textbox", { name: "Search films" });
    await waitFor(() => expect(search).toHaveFocus());
    await user.keyboard("god");
    const unreleased = await screen.findByRole("button", {
      name: "Untitled Future Film"
    });
    expect(screen.getByRole("button", { name: "The Godfather (1972)" })).toBeVisible();
    expect(screen.getByText(/not endorsed or certified by TMDB/)).toBeVisible();

    unreleased.focus();
    await user.keyboard("{Enter}");
    const pick = await screen.findByRole("button", { name: "Pick Untitled Future Film" });
    await waitFor(() => expect(pick).toHaveFocus());
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Picked Untitled Future Film for Best Picture."
    );
    expect(posts()).toEqual([
      { circuit_category_id: 1, film_tmdb_id: 9999001, person_tmdb_id: null }
    ]);
    expect(onPicked).toHaveBeenCalledWith(expect.objectContaining({ id: 50 }));
  });

  it("asks for a person from the credits in an acting category", async () => {
    const user = userEvent.setup();
    renderPicker();
    await chooseCategory(user, "Best Actor");
    await user.type(await screen.findByRole("textbox", { name: "Search films" }), "god");
    await user.click(await screen.findByRole("button", { name: "The Godfather (1972)" }));

    const filter = await screen.findByRole("textbox", {
      name: "Find a person in the credits"
    });
    await waitFor(() => expect(filter).toHaveFocus());
    // Crew are listed too: any credit type qualifies.
    expect(screen.getByRole("button", { name: /Francis Ford Coppola/ })).toBeVisible();
    await user.keyboard("pacino");
    expect(screen.queryByRole("button", { name: /Marlon Brando/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: /Al Pacino/ }));
    await user.click(await screen.findByRole("button", { name: "Pick Al Pacino" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Picked Al Pacino, The Godfather (1972) for Best Actor."
    );
    expect(posts()).toEqual([
      { circuit_category_id: 2, film_tmdb_id: 238, person_tmdb_id: 1158 }
    ]);
  });

  it("shows a refusal for a person outside the credits", async () => {
    route = (path, init) =>
      path.endsWith("/contenders/selections")
        ? {
            status: 422,
            body: {
              error: {
                code: "PERSON_NOT_IN_CREDITS",
                message: "That person isn't in this film's credits"
              }
            }
          }
        : defaultRoute(path, init);
    const user = userEvent.setup();
    renderPicker();
    await chooseCategory(user, "Best Actor");
    await user.type(await screen.findByRole("textbox", { name: "Search films" }), "god");
    await user.click(await screen.findByRole("button", { name: "The Godfather (1972)" }));
    await user.click(await screen.findByRole("button", { name: /Marlon Brando/ }));
    await user.click(await screen.findByRole("button", { name: "Pick Marlon Brando" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That person isn't in this film's credits"
    );
  });

  it("explains a TMDB outage and a rate limit", async () => {
    route = (path, init) =>
      path.includes("/contenders/films/search?q=god")
        ? { status: 503, body: { error: { code: "TMDB_UNAVAILABLE", message: "x" } } }
        : path.includes("/contenders/films/search")
          ? { status: 429, body: { error: { code: "RATE_LIMITED", message: "x" } } }
          : defaultRoute(path, init);
    const user = userEvent.setup();
    renderPicker();
    await chooseCategory(user, "Best Picture");
    const search = await screen.findByRole("textbox", { name: "Search films" });
    await user.type(search, "god");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Film search is unavailable right now."
    );
    await user.clear(search);
    await user.type(search, "alien");
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Too many searches.")
    );
  });

  it("hints instead of searching for one character", async () => {
    const user = userEvent.setup();
    renderPicker();
    await chooseCategory(user, "Best Picture");
    await user.type(await screen.findByRole("textbox", { name: "Search films" }), "g");
    expect(await screen.findByText("Type at least 2 characters to search")).toBeVisible();
    await new Promise((r) => setTimeout(r, 400));
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/contenders/films/search")
      )
    ).toBe(false);
  });

  describe("in a season", () => {
    function withOwner(owner: { user_id: number; username: string } | null) {
      route = (path, init) => {
        const r = defaultRoute(path, init);
        if (path.endsWith("/contenders/selections") && r) {
          return { ...r, body: { ...(r.body as object), owner } };
        }
        return r;
      };
    }

    async function chooseGodfather(user: ReturnType<typeof userEvent.setup>) {
      await chooseCategory(user, "Best Picture");
      await user.type(
        await screen.findByRole("textbox", { name: "Search films" }),
        "god"
      );
      await user.click(
        await screen.findByRole("button", { name: "The Godfather (1972)" })
      );
    }

    it("reads the owner once the contender is chosen and picks a free agent", async () => {
      withOwner(null);
      const user = userEvent.setup();
      const onPicked = vi.fn();
      renderPicker(onPicked, 4);
      await chooseGodfather(user);
      await waitFor(() => expect(screen.getByTestId("owner")).toHaveTextContent("free"));
      expect(posts()[0]).toEqual({
        circuit_category_id: 1,
        film_tmdb_id: 238,
        person_tmdb_id: null,
        circuit_league_id: 4
      });
      await user.click(screen.getByRole("button", { name: "Pick The Godfather" }));
      await waitFor(() => expect(onPicked).toHaveBeenCalled());
    });

    it("never picks a contender someone holds", async () => {
      withOwner({ user_id: 6, username: "pia" });
      const user = userEvent.setup();
      const onPicked = vi.fn();
      renderPicker(onPicked, 4);
      await chooseGodfather(user);
      await waitFor(() => expect(screen.getByTestId("owner")).toHaveTextContent("pia"));
      await user.click(screen.getByRole("button", { name: "Pick The Godfather" }));
      await waitFor(() => expect(posts()).toHaveLength(2));
      expect(onPicked).not.toHaveBeenCalled();
      expect(screen.queryByText(/^Picked /)).toBeNull();
    });

    it("leaves the owner out of the request outside a season", async () => {
      const user = userEvent.setup();
      renderPicker(vi.fn());
      await chooseGodfather(user);
      expect(screen.getByTestId("owner")).toHaveTextContent("unknown");
      expect(posts()).toEqual([]);
    });
  });
});
