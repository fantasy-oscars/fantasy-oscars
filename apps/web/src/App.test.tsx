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
});
