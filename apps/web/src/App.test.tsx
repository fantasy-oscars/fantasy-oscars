import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

    render(<App />);

    expect(screen.getByText(/Fantasy Oscars/i)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/Checking session/i);
    await waitFor(() => expect(screen.getByText(/Not signed in/i)).toBeInTheDocument());
  });

  it("redirects unauthenticated users to login for protected routes", async () => {
    mockFetchSequence({
      ok: true,
      json: () => Promise.resolve({ user: null })
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Login/i })).toBeInTheDocument();
    });
  });

  it("renders protected page when authenticated", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: { sub: "1", handle: "alice" } })
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

    render(<App />);

    await screen.findByText(/Signed in as alice/i);
    await screen.findByRole("heading", { name: /Leagues/i });
  });

  it("shows validation errors from register response", async () => {
    window.history.pushState({}, "", "/register");
    mockFetchSequence(
      {
        ok: true,
        json: () => Promise.resolve({ user: null })
      },
      {
        ok: false,
        json: () =>
          Promise.resolve({
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid field values",
              details: { fields: ["handle", "email"] }
            }
          })
      }
    );

    render(<App />);

    const registerHeading = await screen.findByRole("heading", {
      name: "Create Account"
    });
    const registerCard = registerHeading.closest("section")!;

    await userEvent.click(
      within(registerCard).getByRole("button", { name: /Register/i })
    );

    await screen.findAllByText(/Required/i);

    await userEvent.type(within(registerCard).getByLabelText(/Handle/i), "a");
    await userEvent.type(within(registerCard).getByLabelText(/Email/i), "bad-email");
    await userEvent.type(within(registerCard).getByLabelText(/Display name/i), "A");
    await userEvent.type(within(registerCard).getByLabelText(/Password/i), "p");
    await userEvent.click(
      within(registerCard).getByRole("button", { name: /Register/i })
    );

    await screen.findByText(/Auth error: Invalid field values/i);
  });

  it("shows account details and logout", async () => {
    window.history.pushState({}, "", "/account");
    mockFetchSequence({
      ok: true,
      json: () =>
        Promise.resolve({
          user: {
            sub: "1",
            handle: "alice",
            email: "a@example.com",
            display_name: "Alice"
          }
        })
    });

    render(<App />);
    await screen.findAllByText(/Signed in as alice/i);
    await userEvent.click(screen.getByRole("link", { name: /Account/i }));
    await screen.findByText(/Display name: Alice/i);
    expect(screen.getByText(/Email: a@example.com/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Logout/i }).length).toBeGreaterThan(0);
  });

  it("navigates via nav links", async () => {
    window.history.pushState({}, "", "/leagues");
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: { sub: "1", handle: "alice" } })
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
    render(<App />);
    await screen.findAllByText(/Signed in as alice/i);

    const accountLink = screen.getByRole("link", { name: /Account/i });
    await userEvent.click(accountLink);
    await screen.findByRole("heading", { name: /Account/i });
  });

  it("renders league skeleton states", async () => {
    window.history.pushState({}, "", "/leagues");
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: { sub: "1", handle: "alice" } })
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

    render(<App />);
    await screen.findByText(/Loading leagues/i);
    await screen.findByText(/Alpha/);
  });

  it("accepts invite and navigates", async () => {
    window.history.pushState({}, "", "/invites/42");
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: { sub: "1", handle: "alice" } })
        });
      }
      if (url.includes("/seasons/invites/42/accept")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ invite: { season_id: 99 } })
        });
      }
      if (url.includes("/seasons/99/members")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ members: [] })
        });
      }
      if (url.endsWith("/leagues")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ leagues: [] })
        });
      }
      if (url.includes("/seasons/99/invites")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ invites: [] })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await screen.findByRole("heading", { name: /Invite/i });
    await userEvent.click(screen.getByRole("button", { name: /Accept invite/i }));
    await screen.findByText(/Season 99/i);
  });

  it("renders season and invite routes", async () => {
    window.history.pushState({}, "", "/seasons/2026");
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: { sub: "1", handle: "alice" } })
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
                  status: "EXTANT",
                  scoring_strategy_name: "fixed",
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
                  handle: "alice",
                  display_name: "Alice"
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
      if (url.includes("/seasons/invites/token123/accept")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ invite: { season_id: 2026 } })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await screen.findByRole("heading", { name: /Season 2026/i });

    window.history.pushState({}, "", "/invites/token123");
    render(<App />);
    await screen.findByRole("heading", { name: /Invite/i });
    expect(await screen.findByText(/token123/i)).toBeInTheDocument();
  });

  it("shows invites inbox and accepts a user invite", async () => {
    window.history.pushState({}, "", "/invites");
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: { sub: "1", handle: "alice" } })
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
                  status: "EXTANT",
                  scoring_strategy_name: "fixed",
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
                  handle: "alice",
                  display_name: "Alice"
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
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await screen.findByRole("heading", { name: /Invites/i });
    await userEvent.click(screen.getByRole("button", { name: /Accept/i }));
    await screen.findByRole("heading", { name: /Season 2026/i });
  });

  it("declines an invite and removes it from inbox", async () => {
    window.history.pushState({}, "", "/invites");
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: { sub: "1", handle: "alice" } })
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

    render(<App />);
    await screen.findByRole("heading", { name: /Invites/i });
    await userEvent.click(screen.getByRole("button", { name: /Decline/i }));
    await waitFor(() => expect(screen.queryByText(/3030/)).not.toBeInTheDocument());
  });

  it("loads realtime draft room snapshot and shows status", async () => {
    window.history.pushState({}, "", "/drafts/1");
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: { sub: "1", handle: "alice" } })
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
                status: "PENDING",
                draft_order_type: "snake",
                current_pick_number: 1,
                started_at: null,
                completed_at: null,
                version: 2
              },
              seats: [
                { id: 1, seat_number: 1, league_member_id: 100 },
                { id: 2, seat_number: 2, league_member_id: 200 }
              ],
              picks: [],
              config: { roster_size: 3 },
              version: 2,
              ceremony_starts_at: "2026-02-01T12:00:00.000Z"
            })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await screen.findByRole("heading", { name: /Draft Room/i });
    await screen.findByText(/Draft #1/i);
    await screen.findByText(/Status: PENDING/i);
    expect(screen.getByText(/Disconnected/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/drafts/1/snapshot"),
      expect.objectContaining({ method: "GET" })
    );
  });

  it("shows integrity warning when within T-24h window", async () => {
    vi.setSystemTime(new Date("2026-02-01T00:00:00Z"));
    window.history.pushState({}, "", "/drafts/1");
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: { sub: "1", handle: "alice" } })
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
                status: "IN_PROGRESS",
                draft_order_type: "snake",
                current_pick_number: 2,
                started_at: null,
                completed_at: null,
                version: 5
              },
              seats: [
                { id: 1, seat_number: 1, league_member_id: 100 },
                { id: 2, seat_number: 2, league_member_id: 200 }
              ],
              picks: [],
              config: { roster_size: 3 },
              version: 5,
              ceremony_starts_at: "2026-02-01T12:00:00.000Z"
            })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await screen.findByRole("heading", { name: /Draft Room/i });
    await screen.findByText(
      /once winners start getting entered after the ceremony begins/i
    );
    vi.useRealTimers();
  });

  it("renders results UI skeleton with state matrix", async () => {
    window.history.pushState({}, "", "/results");
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: { sub: "1", handle: "alice" } })
        });
      }
      if (url.includes("/ceremony/active/winners")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              winners: [
                { category_edition_id: 1, nomination_id: 10 },
                { category_edition_id: 2, nomination_id: 20 }
              ]
            })
        });
      }
      if (url.includes("/drafts/1/snapshot")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              draft: {
                id: 1,
                status: "COMPLETED",
                current_pick_number: null,
                version: 2
              },
              seats: [
                { seat_number: 1, league_member_id: 100 },
                { seat_number: 2, league_member_id: 200 }
              ],
              picks: [
                { pick_number: 1, seat_number: 1, nomination_id: 10 },
                { pick_number: 2, seat_number: 2, nomination_id: 30 }
              ],
              version: 2
            })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await screen.findByRole("heading", { name: /Results/i });
    await screen.findAllByText(/Winners/i);
    expect(screen.getByText(/Season standings/i)).toBeInTheDocument();
    expect(screen.getByText(/Pick log/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Drafting locks the moment the first winner is entered/i)
    ).toBeInTheDocument();
  });

  it("blocks non-admins from admin console", async () => {
    window.history.pushState({}, "", "/admin");
    mockFetchSequence({
      ok: true,
      json: () =>
        Promise.resolve({ user: { sub: "1", handle: "alice", is_admin: false } })
    });

    render(<App />);

    await screen.findByText(/Admins only/i);
    expect(screen.getByText(/do not have access/i)).toBeInTheDocument();
  });

  it("renders admin console skeleton for admins", async () => {
    window.history.pushState({}, "", "/admin");
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ user: { sub: "1", handle: "alice", is_admin: true } })
        });
      }
      if (url.includes("/ceremony/active") && (!init || init.method === "GET")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ceremony: { id: 7, code: "oscars-2026", name: "Oscars 2026" }
            })
        });
      }
      if (url.includes("/admin/ceremony/active") && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ceremony_id: 8 })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await screen.findByRole("heading", { name: /Admin console/i });
    await screen.findByText(/Drafts open/i);
    await screen.findAllByText(/Active ceremony/i);
    expect(screen.getByText(/ID 7/)).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText(/Set active ceremony/i));
    await userEvent.type(screen.getByLabelText(/Set active ceremony/i), "8");
    const update = screen.getByRole("button", { name: /Update active ceremony/i });
    await userEvent.click(update);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/admin/ceremony/active"),
        expect.objectContaining({ method: "POST" })
      )
    );
    await screen.findAllByText(/Nominees/i);
    await screen.findAllByText(/Winners/i);
    confirmSpy.mockRestore();
  });

  it("uploads nominees JSON and shows summary", async () => {
    window.history.pushState({}, "", "/admin");
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ user: { sub: "1", handle: "alice", is_admin: true } })
        });
      }
      if (url.includes("/ceremony/active") && (!init || init.method === "GET")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ceremony: { id: 7, code: "oscars-2026", name: "Oscars 2026" }
            })
        });
      }
      if (url.includes("/admin/nominees/upload") && init?.method === "POST") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await screen.findByRole("heading", { name: /Admin console/i });
    const fileInput = await screen.findByLabelText(/Nominees JSON file/i);
    const file = new File(
      [JSON.stringify({ categories: [{}], nominations: [{ id: 1 }, { id: 2 }] })],
      "nominees.json",
      { type: "application/json" }
    );
    await userEvent.upload(fileInput, file);
    await screen.findByText(/Categories: 1/);
    await userEvent.click(screen.getByRole("button", { name: /Upload nominees/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/admin/nominees/upload"),
        expect.objectContaining({ method: "POST" })
      )
    );
    await screen.findByText(/Nominees loaded for active ceremony/i);
  });

  it("saves winners per category with confirmations and lock state", async () => {
    window.history.pushState({}, "", "/admin");
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ user: { sub: "1", handle: "alice", is_admin: true } })
        });
      }
      if (url.includes("/ceremony/active/lock")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ draft_locked: false, draft_locked_at: null })
        });
      }
      if (url.includes("/ceremony/active/nominations")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              nominations: [
                { id: 1, category_edition_id: 10, film_title: "Picture A" },
                { id: 2, category_edition_id: 10, film_title: "Picture B" },
                { id: 3, category_edition_id: 11, film_title: "Actor A" }
              ]
            })
        });
      }
      if (url.includes("/ceremony/active/winners")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ winners: [] })
        });
      }
      if (url.includes("/ceremony/active") && (!init || init.method === "GET")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ceremony: { id: 7, code: "oscars-2026", name: "Oscars 2026" }
            })
        });
      }
      if (url.includes("/admin/winners") && init?.method === "POST") {
        const body = JSON.parse((init.body as string) ?? "{}");
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              winner: { nomination_id: body.nomination_id },
              draft_locked_at: "2026-01-01T00:00:00Z"
            })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await screen.findByText(/Drafts open/i);
    await screen.findByText(/Nomination #1/);
    const category10 = screen.getByText(/Category 10/).closest("div.card");
    expect(category10).toBeTruthy();
    const firstRadio = within(category10 as HTMLElement).getByLabelText(/Nomination #1/);
    await userEvent.click(firstRadio);
    await waitFor(() => expect(firstRadio).toBeChecked());
    await userEvent.click(
      within(category10 as HTMLElement).getByRole("button", { name: /Save winner/i })
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((call) => String(call[0]).includes("/admin/winners"))
      ).toBeTruthy()
    );
    await screen.findAllByText(/Drafts locked/i);

    const secondRadio = within(category10 as HTMLElement).getByLabelText(/Nomination #2/);
    await userEvent.click(secondRadio);
    await waitFor(() => expect(secondRadio).toBeChecked());
    await userEvent.click(
      within(category10 as HTMLElement).getByRole("button", { name: /Save winner/i })
    );
    await waitFor(() => {
      const winnerPosts = fetchMock.mock.calls.filter((call) =>
        String(call[0]).includes("/admin/winners")
      );
      expect(winnerPosts.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("shows commissioner controls on league page and allows remove/transfer/copy", async () => {
    // mock clipboard
    const writeText = vi.fn();
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    global.navigator.clipboard = { writeText };
    // mock confirm
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    window.history.pushState({}, "", "/leagues/10");
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: { sub: "1", handle: "alice" } })
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
                  handle: "alice",
                  display_name: "Alice"
                },
                {
                  id: 2,
                  league_id: 10,
                  user_id: 2,
                  role: "MEMBER",
                  handle: "bob",
                  display_name: "Bob"
                }
              ]
            })
        });
      }
      if (url.endsWith("/leagues/10/members/2") && init?.method === "DELETE") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      }
      if (url.endsWith("/leagues/10/transfer") && init?.method === "POST") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await screen.findByRole("heading", { name: /Roster/i });
    await userEvent.click(screen.getByRole("button", { name: /Copy invite/i }));
    expect(writeText).toHaveBeenCalled();

    const transferSelect = screen.getByLabelText(/Transfer to member/i);
    await userEvent.selectOptions(transferSelect, "2");
    await userEvent.click(screen.getByRole("button", { name: /Transfer commissioner/i }));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/leagues/10/transfer"),
      expect.objectContaining({ method: "POST" })
    );

    // Remove Bob
    await userEvent.click(screen.getByRole("button", { name: /Remove/i }));
    await waitFor(() => expect(screen.queryByText(/Bob/)).not.toBeInTheDocument());

    confirmSpy.mockRestore();
  });
});
