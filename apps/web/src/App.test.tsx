import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
    expect(screen.getByRole("link", { name: /Leagues/i })).toHaveClass("active");
    expect(screen.getByRole("heading", { name: /Leagues/i })).toBeInTheDocument();
  });

  it("navigates via nav links", async () => {
    mockFetchSequence({
      ok: true,
      json: () => Promise.resolve({ user: { sub: "1", handle: "alice" } })
    });
    render(<App />);
    await screen.findByText(/Signed in as alice/i);

    const accountLink = screen.getByRole("link", { name: /Account/i });
    await userEvent.click(accountLink);
    await screen.findByRole("heading", { name: /Account/i });
  });
});
