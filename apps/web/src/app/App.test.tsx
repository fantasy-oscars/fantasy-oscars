import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@ui";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    io: { on: vi.fn(), off: vi.fn() }
  }))
}));

function mockFetchSequence(
  ...responses: Array<{ ok: boolean; json: () => Promise<unknown> }>
) {
  const fetchMock = vi.fn().mockImplementation(() => {
    const idx = fetchMock.mock.calls.length;
    const responder = responses[idx] ?? responses[responses.length - 1];
    return Promise.resolve(responder);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderApp() {
  return render(
    <MantineProvider>
      <App />
    </MantineProvider>
  );
}

describe("<App /> shell + routing", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows nav and loading state while checking session", async () => {
    mockFetchSequence(
      new Promise((resolve) =>
        setTimeout(
          () => resolve({ ok: true, json: () => Promise.resolve({ user: null }) }),
          20
        )
      ) as unknown as { ok: boolean; json: () => Promise<unknown> }
    );

    renderApp();

    expect(
      screen.getAllByRole("heading", { level: 1, name: "Fantasy Oscars" }).length
    ).toBeGreaterThan(0);
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByRole("link", { name: /Login/i }).length).toBeGreaterThan(0);
    });
  });

  it("redirects unauthenticated users to login for protected routes", async () => {
    window.history.pushState({}, "", "/leagues");
    mockFetchSequence({
      ok: true,
      json: () => Promise.resolve({ user: null })
    });

    renderApp();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Sign in/i })).toBeInTheDocument();
    });
  });

  it("renders protected page when authenticated", async () => {
    window.history.pushState({}, "", "/leagues");
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: { sub: "1", username: "alice" } })
        });
      }
      if (url.includes("/leagues")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ leagues: [] })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp();

    await screen.findByRole("button", { name: /alice/i });
    await screen.findByRole("heading", { name: /Leagues/i });
  });

  it("shows validation errors from register response", async () => {
    window.history.pushState({}, "", "/register");
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: null })
        });
      }
      if (url.includes("/auth/register")) {
        return Promise.resolve({
          ok: false,
          json: () =>
            Promise.resolve({
              error: {
                code: "VALIDATION_ERROR",
                message: "Invalid field values",
                details: { fields: ["username", "email"] }
              }
            })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp();

    const registerHeading = await screen.findByRole("heading", {
      name: /Create account/i
    });
    const registerCard = registerHeading.closest("section")!;

    await userEvent.click(
      within(registerCard).getByRole("button", { name: /Create account/i })
    );

    // Use values that pass client-side validation so the request reaches the API.
    await userEvent.type(within(registerCard).getByLabelText(/Username/i), "alice");
    await userEvent.type(
      within(registerCard).getByLabelText(/Email/i),
      "alice@example.com"
    );
    await userEvent.type(within(registerCard).getByLabelText(/Password/i), "password1");
    await userEvent.click(
      within(registerCard).getByRole("button", { name: /Create account/i })
    );

    await screen.findByText(/Please fix the highlighted fields and try again\./i);
  });

  it("shows account details and logout", async () => {
    window.history.pushState({}, "", "/account");
    mockFetchSequence({
      ok: true,
      json: () =>
        Promise.resolve({
          user: {
            sub: "1",
            username: "alice",
            email: "a@example.com"
          }
        })
    });

    renderApp();
    await screen.findByRole("button", { name: /alice/i });
    const details = screen.getByRole("region", { name: /Account details/i });
    expect(within(details).getByText("Username")).toBeInTheDocument();
    expect(within(details).getByText("alice")).toBeInTheDocument();
    expect(within(details).getByText("Email")).toBeInTheDocument();
    expect(within(details).getByText("a@example.com")).toBeInTheDocument();
    expect(within(details).getByRole("button", { name: /Logout/i })).toBeInTheDocument();
  });

  it("navigates via nav links", async () => {
    window.history.pushState({}, "", "/leagues");
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: { sub: "1", username: "alice" } })
        });
      }
      if (url.includes("/leagues")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ leagues: [] })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderApp();
    await screen.findByRole("button", { name: /alice/i });

    const nav = screen.getByRole("navigation", { name: "Primary" });
    const aboutLink = within(nav).getByRole("link", { name: /About/i });
    await userEvent.click(aboutLink);
    await screen.findByRole("heading", { name: /About/i });
  });

  it("renders league skeleton states", async () => {
    window.history.pushState({}, "", "/leagues");
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: { sub: "1", username: "alice" } })
        });
      }
      if (url.includes("/leagues")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              leagues: [{ id: 10, code: "alpha", name: "Alpha", ceremony_id: 1 }]
            })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp();
    await screen.findByText(/Loading/i);
    await screen.findByText(/Alpha/);
  });

  it("accepts invite and navigates", async () => {
    window.history.pushState({}, "", "/invites/42");
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: { sub: "1", username: "alice" } })
        });
      }
      if (url.includes("/seasons/invites/42/accept")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ invite: { season_id: 99 } })
        });
      }
      if (url.includes("/seasons/invites/inbox")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ invites: [] })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp();
    await screen.findByText(/Opening invite/i);
    await screen.findByRole("heading", { name: /Invites/i });
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((call) =>
          String(call[0]).includes("/seasons/invites/42/accept")
        )
      ).toBe(true)
    );
  });

  it("renders season and invite routes", async () => {
    window.history.pushState({}, "", "/seasons/2026");
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: { sub: "1", username: "alice" } })
        });
      }
      if (url.includes("/seasons/2026/members")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              members: [
                {
                  id: 1,
                  season_id: 2026,
                  user_id: 1,
                  league_member_id: 10,
                  role: "OWNER",
                  joined_at: new Date().toISOString()
                }
              ]
            })
        });
      }
      if (url.endsWith("/leagues")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              leagues: [{ id: 10, code: "alpha", name: "Alpha", ceremony_id: 1 }]
            })
        });
      }
      if (url.includes("/leagues/10/seasons")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              seasons: [
                {
                  id: 2026,
                  ceremony_id: 1,
                  ceremony_name: "Oscars 2026",
                  status: "EXTANT",
                  scoring_strategy_name: "fixed",
                  remainder_strategy: "UNDRAFTED",
                  pick_timer_seconds: 60,
                  ceremony_starts_at: "2026-02-01T12:00:00.000Z",
                  draft_id: 1,
                  draft_status: "PENDING",
                  created_at: new Date().toISOString()
                }
              ]
            })
        });
      }
      if (url.includes("/leagues/10/members")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              members: [
                {
                  id: 10,
                  league_id: 10,
                  user_id: 1,
                  role: "OWNER",
                  username: "alice"
                }
              ]
            })
        });
      }
      if (url.includes("/seasons/2026/invites")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ invites: [] })
        });
      }
      if (url.includes("/ceremonies") && !url.includes("/admin/")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ceremonies: [{ id: 1, name: "Oscars 2026", status: "PUBLISHED" }]
            })
        });
      }
      if (url.includes("/seasons/invites/token/token123/accept")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ invite: { season_id: 2026 } })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp();
    await screen.findByRole("heading", { name: /Oscars 2026/i });

    cleanup();
    window.history.pushState({}, "", "/invites/token123");
    renderApp();
    await screen.findByRole("heading", { name: /Invites/i });
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((call) =>
          String(call[0]).includes("/seasons/invites/token/token123/accept")
        )
      ).toBe(true)
    );
  });

  it("shows invites inbox and accepts a user invite", async () => {
    window.history.pushState({}, "", "/invites");
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: { sub: "1", username: "alice" } })
        });
      }
      if (url.includes("/seasons/invites/inbox")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              invites: [
                {
                  id: 55,
                  season_id: 2026,
                  status: "PENDING",
                  label: null,
                  kind: "USER_TARGETED",
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  claimed_at: null,
                  league_id: 10,
                  league_name: "Alpha",
                  ceremony_id: 1
                }
              ]
            })
        });
      }
      if (url.includes("/seasons/invites/55/accept")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ invite: { season_id: 2026 } })
        });
      }
      if (url.endsWith("/leagues/10/seasons")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              seasons: [
                {
                  id: 2026,
                  ceremony_id: 1,
                  ceremony_name: "Oscars 2026",
                  status: "EXTANT",
                  scoring_strategy_name: "fixed",
                  remainder_strategy: "UNDRAFTED",
                  pick_timer_seconds: 60,
                  ceremony_starts_at: "2026-02-01T12:00:00.000Z",
                  draft_id: 1,
                  draft_status: "PENDING",
                  created_at: new Date().toISOString()
                }
              ]
            })
        });
      }
      if (url.endsWith("/leagues")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              leagues: [{ id: 10, code: "alpha", name: "Alpha", ceremony_id: 1 }]
            })
        });
      }
      if (url.includes("/leagues/10/members")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              members: [
                {
                  id: 1,
                  league_id: 10,
                  user_id: 1,
                  role: "OWNER",
                  username: "alice"
                }
              ]
            })
        });
      }
      if (url.includes("/seasons/2026/members")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ members: [] })
        });
      }
      if (url.includes("/seasons/2026/invites")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ invites: [] })
        });
      }
      if (url.includes("/ceremonies") && !url.includes("/admin/")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ceremonies: [{ id: 1, name: "Oscars 2026", status: "PUBLISHED" }]
            })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp();

    await screen.findByRole("heading", { name: /Invites/i });
    const accept = await screen.findByRole("button", { name: /Accept/i });
    await userEvent.click(accept);
    await screen.findByRole("heading", { name: /Oscars 2026/i });
  });

  it("declines an invite and removes it from inbox", async () => {
    window.history.pushState({}, "", "/invites");
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: { sub: "1", username: "alice" } })
        });
      }
      if (url.includes("/seasons/invites/inbox")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              invites: [
                {
                  id: 77,
                  season_id: 3030,
                  status: "PENDING",
                  label: null,
                  kind: "USER_TARGETED",
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  claimed_at: null,
                  league_id: null,
                  league_name: null,
                  ceremony_id: null
                }
              ]
            })
        });
      }
      if (url.includes("/seasons/invites/77/decline")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ invite: { season_id: 3030 } })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp();
    await screen.findByRole("heading", { name: /Invites/i });
    await userEvent.click(screen.getByRole("button", { name: /Decline/i }));
    await waitFor(() => expect(screen.queryByText(/3030/)).not.toBeInTheDocument());
  });

  it("loads realtime draft room snapshot and shows draft room controls", async () => {
    window.history.pushState({}, "", "/drafts/1");
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: { sub: "1", username: "alice" } })
        });
      }
      if (url.includes("/drafts/1/snapshot")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              draft: {
                id: 1,
                league_id: 10,
                season_id: 1,
                status: "PENDING",
                current_pick_number: 1,
                started_at: null,
                completed_at: null,
                version: 2
              },
              seats: [],
              picks: [],
              version: 2,
              total_picks: 0,
              my_seat_number: null,
              categories: [],
              nominations: [],
              ceremony_starts_at: "2026-02-01T12:00:00.000Z"
            })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp();

    await waitFor(() => {
      expect(document.querySelector('[data-screen="draft-room"]')).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/drafts/1/snapshot"),
      expect.objectContaining({ method: "GET" })
    );
  });

  it("redirects /results to ceremonies index", async () => {
    window.history.pushState({}, "", "/results");
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: { sub: "1", username: "alice" } })
        });
      }
      if (url.includes("/ceremonies") && !url.includes("/admin/")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ceremonies: [] })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp();

    await screen.findByRole("heading", { name: /Ceremonies/i });
  });

  it("blocks non-admins from admin console", async () => {
    window.history.pushState({}, "", "/admin");
    mockFetchSequence({
      ok: true,
      json: () =>
        Promise.resolve({ user: { sub: "1", username: "alice", is_admin: false } })
    });

    renderApp();

    await screen.findByText(/Admins only/i);
    expect(screen.getByText(/do not have access/i)).toBeInTheDocument();
  });

  it("renders admin console skeleton for admins", async () => {
    window.history.pushState({}, "", "/admin/ceremonies/1");
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith("/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ user: { sub: "1", username: "alice", is_admin: true } })
        });
      }
      if (url.endsWith("/admin/ceremonies") && (!init || init.method === "GET")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ceremonies: [
                {
                  id: 1,
                  code: "oscars-2026",
                  name: "Oscars 2026",
                  starts_at: null,
                  status: "DRAFT"
                }
              ]
            })
        });
      }
      if (url.endsWith("/admin/ceremonies/1") && (!init || init.method === "GET")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ceremony: {
                id: 1,
                code: "oscars-2026",
                name: "Oscars 2026",
                starts_at: null,
                status: "DRAFT",
                draft_warning_hours: 24,
                draft_locked_at: null,
                published_at: null,
                archived_at: null
              },
              stats: {
                categories_total: 0,
                categories_with_nominees: 0,
                nominees_total: 0,
                winners_total: 0
              }
            })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp();

    await screen.findByRole("heading", { name: /Initialize ceremony/i });
    await screen.findByRole("button", { name: /Next/i });
  });

  it("uploads candidate films JSON and shows summary", async () => {
    window.history.pushState({}, "", "/admin/ceremonies/1/populate");
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith("/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ user: { sub: "1", username: "alice", is_admin: true } })
        });
      }
      if (url.endsWith("/admin/ceremonies") && (!init || init.method === "GET")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ceremonies: [
                {
                  id: 1,
                  code: "oscars-2026",
                  name: "Oscars 2026",
                  starts_at: null,
                  status: "DRAFT"
                }
              ]
            })
        });
      }
      if (url.endsWith("/admin/ceremonies/1") && (!init || init.method === "GET")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ceremony: {
                id: 1,
                code: "oscars-2026",
                name: "Oscars 2026",
                starts_at: null,
                status: "DRAFT",
                draft_warning_hours: 24,
                draft_locked_at: null,
                published_at: null,
                archived_at: null
              },
              stats: {
                categories_total: 1,
                categories_with_nominees: 0,
                nominees_total: 0,
                winners_total: 0
              }
            })
        });
      }
      if (
        url.endsWith("/admin/ceremonies/1/categories") &&
        (!init || init.method === "GET")
      ) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              categories: [{ id: 10, unit_kind: "FILM", family_name: "Best Picture" }]
            })
        });
      }
      if (url.endsWith("/admin/films") && (!init || init.method === "GET")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ films: [] }) });
      }
      if (url.endsWith("/admin/films/import") && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ upserted: 2, hydrated: 2, tmdb_errors: [] })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp();

    await screen.findByRole("heading", { name: /Populate nominees/i });
    await userEvent.click(screen.getByRole("button", { name: /Candidate pool/i }));
    const fileInput = await waitFor(() => {
      const el = document.querySelector(
        'input[type="file"][name="candidate-pool-file"]'
      ) as HTMLInputElement | null;
      if (!el) throw new Error("Missing candidate pool file input");
      return el;
    });
    const file = new File(
      [
        JSON.stringify([
          { tmdb_id: 1, title: "Film A" },
          { tmdb_id: 2, title: "Film B" }
        ])
      ],
      "candidate-films.json",
      { type: "application/json" }
    );
    await userEvent.upload(fileInput, file);
    await waitFor(() => expect(fileInput.files?.length ?? 0).toBe(1));
    await userEvent.click(
      await screen.findByRole("button", { name: /Load candidate pool/i })
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/admin/films/import"),
        expect.objectContaining({ method: "POST" })
      )
    );
  });

  it("saves winners per category with confirmations and lock state", async () => {
    window.history.pushState({}, "", "/admin/ceremonies/1/results");
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith("/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ user: { sub: "1", username: "alice", is_admin: true } })
        });
      }
      if (url.endsWith("/admin/ceremonies") && (!init || init.method === "GET")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ceremonies: [
                {
                  id: 1,
                  code: "oscars-2026",
                  name: "Oscars 2026",
                  starts_at: null,
                  status: "DRAFT"
                }
              ]
            })
        });
      }
      if (url.endsWith("/admin/ceremonies/1") && (!init || init.method === "GET")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ceremony: {
                id: 1,
                code: "oscars-2026",
                name: "Oscars 2026",
                starts_at: null,
                status: "PUBLISHED",
                draft_warning_hours: 24,
                draft_locked_at: null,
                published_at: "2026-01-01T00:00:00Z",
                archived_at: null
              },
              stats: {
                categories_total: 2,
                categories_with_nominees: 2,
                nominees_total: 3,
                winners_total: 0
              }
            })
        });
      }
      if (url.endsWith("/admin/ceremonies/1/lock")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              draft_locked: false,
              draft_locked_at: null,
              status: "PUBLISHED"
            })
        });
      }
      if (url.endsWith("/admin/ceremonies/1/nominations")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              nominations: [
                { id: 1, category_edition_id: 10, film_title: "Picture A" },
                { id: 2, category_edition_id: 10, film_title: "Picture B" },
                {
                  id: 3,
                  category_edition_id: 11,
                  film_title: "Actor Film",
                  performer_name: "Actor A"
                }
              ]
            })
        });
      }
      if (
        url.endsWith("/admin/ceremonies/1/categories") &&
        (!init || init.method === "GET")
      ) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              categories: [
                {
                  id: 10,
                  unit_kind: "FILM",
                  family_name: "Best Picture",
                  family_icon_code: "trophy",
                  family_icon_variant: "default"
                },
                {
                  id: 11,
                  unit_kind: "PERFORMANCE",
                  family_name: "Actor",
                  family_icon_code: "person",
                  family_icon_variant: "default"
                }
              ]
            })
        });
      }
      if (url.endsWith("/admin/ceremonies/1/winners")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ winners: [] })
        });
      }
      if (url.endsWith("/admin/winners") && init?.method === "POST") {
        const body = JSON.parse((init.body as string) ?? "{}");
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              winner: { nomination_ids: body.nomination_ids },
              draft_locked_at: "2026-01-01T00:00:00Z"
            })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp();

    await screen.findByText(/Drafts open/i);
    const allCheckboxes = await screen.findAllByRole("checkbox", {
      name: /Select winner:/i
    });
    const firstCheckbox = allCheckboxes[0];
    await userEvent.click(firstCheckbox);
    await waitFor(() => expect(firstCheckbox).toBeChecked());
    await userEvent.click(screen.getByRole("button", { name: /^Save$/i }));
    await userEvent.click(screen.getByRole("button", { name: /Save winners/i }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((call) => String(call[0]).includes("/admin/winners"))
      ).toBeTruthy()
    );
    await screen.findAllByText(/Drafts locked/i);

    const secondCheckbox = allCheckboxes[1];
    await userEvent.click(secondCheckbox);
    await waitFor(() => expect(secondCheckbox).toBeChecked());
    await userEvent.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => {
      const winnerPosts = fetchMock.mock.calls.filter((call) =>
        String(call[0]).includes("/admin/winners")
      );
      expect(winnerPosts.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("shows commissioner controls on league page and allows transfer/delete", async () => {
    window.history.pushState({}, "", "/leagues/10");
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: { sub: "1", username: "alice" } })
        });
      }
      if (url.endsWith("/leagues/10")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              league: { id: 10, code: "alpha", name: "Alpha", ceremony_id: 1 }
            })
        });
      }
      if (url.endsWith("/leagues/10/seasons")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              seasons: [
                {
                  id: 2026,
                  league_id: 10,
                  ceremony_id: 1,
                  status: "EXTANT",
                  created_at: new Date().toISOString()
                }
              ]
            })
        });
      }
      if (url.endsWith("/leagues/10/members")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              members: [
                {
                  id: 1,
                  league_id: 10,
                  user_id: 1,
                  role: "OWNER",
                  username: "alice"
                },
                {
                  id: 2,
                  league_id: 10,
                  user_id: 2,
                  role: "MEMBER",
                  username: "bob"
                }
              ]
            })
        });
      }
      if (url.endsWith("/leagues/10/transfer") && init?.method === "POST") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      }
      if (url.endsWith("/leagues/10") && init?.method === "DELETE") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp();

    await screen.findByRole("heading", { name: /Seasons/i });
    await screen.findByRole("heading", { name: /Members/i });

    await userEvent.click(screen.getByRole("button", { name: /Transfer ownership/i }));
    const transferDialog = await screen.findByRole("dialog", {
      name: /Transfer ownership/i
    });
    const transferSelect = within(transferDialog).getByRole("textbox", {
      name: /Member/i
    });
    await userEvent.click(transferSelect);
    const listboxId = transferSelect.getAttribute("aria-controls");
    expect(listboxId).toBeTruthy();
    const listbox = await waitFor(() => {
      const el = listboxId ? document.getElementById(listboxId) : null;
      if (!el) throw new Error("Missing listbox");
      return el;
    });
    await userEvent.click(within(listbox).getByText(/^bob$/i));
    await userEvent.click(
      within(transferDialog).getByRole("button", { name: /Transfer ownership/i })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/leagues/10/transfer"),
      expect.objectContaining({ method: "POST" })
    );

    await userEvent.click(screen.getByRole("button", { name: /Delete league/i }));
    const deleteDialog = await screen.findByRole("dialog", { name: /Delete league\\?/i });
    await userEvent.click(
      within(deleteDialog).getByRole("button", { name: /^Delete$/i })
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          (call) =>
            String(call[0]).endsWith("/leagues/10") && call[1]?.method === "DELETE"
        )
      ).toBe(true)
    );
  });
});
