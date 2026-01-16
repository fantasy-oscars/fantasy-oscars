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
    mockFetchSequence({
      ok: true,
      json: () => Promise.resolve({ user: { sub: "1", handle: "alice" } })
    });

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
    mockFetchSequence({
      ok: true,
      json: () => Promise.resolve({ user: { sub: "1", handle: "alice" } })
    });
    render(<App />);
    await screen.findAllByText(/Signed in as alice/i);

    const accountLink = screen.getByRole("link", { name: /Account/i });
    await userEvent.click(accountLink);
    await screen.findByRole("heading", { name: /Account/i });
  });

  it("shows forgot password link on login", async () => {
    mockFetchSequence({
      ok: true,
      json: () => Promise.resolve({ user: null })
    });
    render(<App />);
    await screen.findByRole("heading", { name: /Login/i });
    expect(screen.getByRole("link", { name: /Forgot password/i })).toHaveAttribute(
      "href",
      "/reset"
    );
  });

  it("surfaces inline reset token and pre-fills confirm form", async () => {
    window.history.pushState({}, "", "/reset");
    mockFetchSequence(
      {
        ok: true,
        json: () => Promise.resolve({ user: null })
      },
      {
        ok: true,
        json: () => Promise.resolve({ delivery: "inline", token: "devtoken123" })
      }
    );

    render(<App />);
    const emailInput = await screen.findByLabelText(/Email/i);
    await userEvent.type(emailInput, "user@example.com");
    await userEvent.click(screen.getByRole("button", { name: /Send reset link/i }));

    await screen.findByText(/dev token/i);
    await userEvent.click(
      screen.getByRole("button", { name: /Open reset form with token/i })
    );

    await screen.findByRole("heading", { name: /Set New Password/i });
    expect(screen.getByLabelText(/Reset token/i)).toHaveValue("devtoken123");
  });
});
