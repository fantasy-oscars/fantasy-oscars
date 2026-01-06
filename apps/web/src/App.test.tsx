import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("<App />", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  type MockResponse = { ok: boolean; json: () => Promise<unknown> };
  type Responder = (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => Promise<MockResponse>;

  function mockFetchSequence(...responders: Responder[]) {
    const fetchMock = vi
      .fn()
      .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const idx = fetchMock.mock.calls.length - 1;
        const responder = responders[idx] ?? responders[responders.length - 1];
        return responder(input, init);
      });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("renders the heading", () => {
    mockFetchSequence(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ user: null }) })
    );
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "Event setup and draft room" })
    ).toBeInTheDocument();
  });

  it("submits register form and shows success", async () => {
    const fetchMock = mockFetchSequence(
      () => Promise.resolve({ ok: true, json: () => Promise.resolve({ user: null }) }),
      () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    );

    render(<App />);
    const registerCard = screen
      .getAllByRole("heading", { name: "Create Account" })[0]
      .closest("section")!;
    fireEvent.change(within(registerCard).getByLabelText(/Handle/i), {
      target: { value: "alice" }
    });
    fireEvent.change(within(registerCard).getByLabelText(/Email/i), {
      target: { value: "a@example.com" }
    });
    fireEvent.change(within(registerCard).getByLabelText(/Display name/i), {
      target: { value: "Alice" }
    });
    fireEvent.change(within(registerCard).getByLabelText(/^Password/i), {
      target: { value: "secret" }
    });
    fireEvent.click(within(registerCard).getByRole("button", { name: /Register/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(await screen.findByRole("status")).toHaveTextContent("Success");
  });

  it("blocks login submit when required fields missing", async () => {
    const fetchMock = mockFetchSequence(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ user: null }) })
    );
    render(<App />);
    const loginCard = screen
      .getAllByRole("heading", { name: "Login" })[0]
      .closest("section")!;

    fireEvent.click(within(loginCard).getByRole("button", { name: /Login/i }));

    await waitFor(() => {
      const required = within(loginCard).getAllByText(/Required/i, { selector: "small" });
      expect(required.length).toBeGreaterThan(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1); // only auth/me
  });

  it("submits reset confirm with token", async () => {
    const fetchMock = mockFetchSequence(
      () => Promise.resolve({ ok: true, json: () => Promise.resolve({ user: null }) }),
      () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    );
    render(<App />);
    const resetCard = screen
      .getAllByRole("heading", { name: "Set New Password" })[0]
      .closest("section")!;

    fireEvent.change(within(resetCard).getByLabelText(/Reset token/i), {
      target: { value: "t-123" }
    });
    fireEvent.change(within(resetCard).getByLabelText(/New password/i), {
      target: { value: "newpass" }
    });
    fireEvent.click(within(resetCard).getByRole("button", { name: /Update password/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse(fetchMock.mock.calls[1][1]?.body as string);
    expect(body.token).toBe("t-123");
    expect(body.password).toBe("newpass");
  });

  it("shows loading and renders snapshot data", async () => {
    const snapshot = {
      draft: { id: 7, status: "IN_PROGRESS", current_pick_number: 3 },
      seats: [
        { seat_number: 1, league_member_id: 11 },
        { seat_number: 2, league_member_id: 22 }
      ],
      picks: [{ pick_number: 1, seat_number: 1, nomination_id: 99 }],
      version: 1
    };
    const fetchMock = mockFetchSequence(
      // auth/me returns logged-in user so Draft tab is enabled
      () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: { sub: "1", handle: "alice" } })
        }),
      // snapshot call
      () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(snapshot)
        })
    );

    render(<App />);
    let draftBtn: HTMLElement | undefined;
    await waitFor(() => {
      draftBtn = screen
        .getAllByRole("button", { name: /Draft room/i })
        .find((b) => !b.hasAttribute("disabled"));
      expect(draftBtn).toBeDefined();
    });
    fireEvent.click(draftBtn!);
    const loadBtn = await screen.findByRole("button", { name: /Load snapshot/i });
    fireEvent.click(loadBtn);

    expect(screen.getByText(/Loading draft snapshot/i)).toBeInTheDocument();

    await screen.findByText(/Status: IN_PROGRESS/);
    expect(screen.getByText(/Seat 1 · Member 11/)).toBeInTheDocument();
    expect(screen.getByText(/Nomination 99/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
