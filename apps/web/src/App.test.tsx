import { cleanup, render } from "@testing-library/react";
import { fireEvent, screen, waitFor, within } from "@testing-library/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("<App />", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
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
        .find((b: HTMLElement) => !b.hasAttribute("disabled"));
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

  it("starts a pending draft and refreshes snapshot", async () => {
    const pendingSnapshot = {
      draft: { id: 7, status: "PENDING", current_pick_number: 1 },
      seats: [{ seat_number: 1, league_member_id: 11, user_id: 1 }],
      picks: [],
      version: 0
    };
    const inProgressSnapshot = {
      ...pendingSnapshot,
      draft: { ...pendingSnapshot.draft, status: "IN_PROGRESS" },
      version: 1
    };

    const fetchMock = mockFetchSequence(
      // auth/me
      () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: { sub: "1", handle: "alice" } })
        }),
      // initial snapshot load
      () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(pendingSnapshot)
        }),
      // start draft
      (input, init) => {
        expect(String(input)).toContain("/drafts/7/start");
        expect(init?.method).toBe("POST");
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ draft: inProgressSnapshot.draft })
        });
      },
      // refreshed snapshot after start
      () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(inProgressSnapshot)
        })
    );

    render(<App />);

    const draftBtns = await screen.findAllByRole("button", { name: /Draft room/i });
    const draftBtn =
      draftBtns.find((btn: HTMLElement) => !btn.hasAttribute("disabled")) ?? draftBtns[0];
    fireEvent.click(draftBtn);

    const loadBtn = await screen.findByRole("button", { name: /Load snapshot/i });
    fireEvent.click(loadBtn);
    await screen.findByText(/Status: PENDING/);

    const startBtn = screen.getByRole("button", { name: /Start draft/i });
    fireEvent.click(startBtn);

    await screen.findByText(/Draft started/);
    await screen.findByText(/Status: IN_PROGRESS/);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("disables pick controls when it is not your turn", async () => {
    const snapshot = {
      draft: { id: 7, status: "IN_PROGRESS", current_pick_number: 1 },
      seats: [
        { seat_number: 1, league_member_id: 11, user_id: 1 },
        { seat_number: 2, league_member_id: 22, user_id: 2 }
      ],
      picks: [],
      version: 1
    };
    mockFetchSequence(
      () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: { sub: "2", handle: "bob" } })
        }),
      () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(snapshot)
        })
    );

    render(<App />);

    await screen.findByText(/Signed in as/i);
    const draftBtn = await screen.findByRole("button", { name: /Draft room/i });
    await waitFor(() => expect(draftBtn).not.toBeDisabled());
    fireEvent.click(draftBtn);
    const loadBtn = await screen.findByRole("button", { name: /Load snapshot/i });
    fireEvent.click(loadBtn);

    await screen.findByText(/Status: IN_PROGRESS/);
    const pickInput = screen.getByLabelText(/Nomination ID/i);
    const submitBtn = screen.getByRole("button", { name: /Submit pick/i });
    await waitFor(() => expect(pickInput).toBeDisabled());
    await waitFor(() => expect(submitBtn).toBeDisabled());
    expect(
      screen.getByText(/Waiting for seat 1 to pick|It is not your turn/i)
    ).toBeInTheDocument();
  });

  it("submits pick when it is your turn and shows success", async () => {
    const snapshot = {
      draft: { id: 7, status: "IN_PROGRESS", current_pick_number: 1 },
      seats: [
        { seat_number: 1, league_member_id: 11, user_id: 1 },
        { seat_number: 2, league_member_id: 22, user_id: 2 }
      ],
      picks: [],
      version: 1
    };
    const postPickSnapshot = {
      ...snapshot,
      draft: { ...snapshot.draft, current_pick_number: 2 },
      picks: [{ pick_number: 1, seat_number: 1, nomination_id: 12 }],
      version: 2
    };

    const fetchMock = mockFetchSequence(
      // auth/me
      () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: { sub: "1", handle: "alice" } })
        }),
      // initial snapshot load
      () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(snapshot)
        }),
      // submit pick
      (input, init) => {
        expect(String(input)).toContain("/drafts/7/picks");
        expect(init?.method).toBe("POST");
        const body = JSON.parse(init?.body as string);
        expect(body.nomination_id).toBe(12);
        expect(body.request_id).toBeDefined();
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ pick: postPickSnapshot.picks[0] })
        });
      },
      // refresh snapshot
      () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(postPickSnapshot)
        })
    );

    render(<App />);
    await screen.findByText(/Signed in as/i);
    const draftBtn = await screen.findByRole("button", { name: /Draft room/i });
    await waitFor(() => expect(draftBtn).not.toBeDisabled());
    fireEvent.click(draftBtn);
    const loadBtn = await screen.findByRole("button", { name: /Load snapshot/i });
    fireEvent.click(loadBtn);
    await screen.findByText(/Status: IN_PROGRESS/);

    const pickInput = screen.getByLabelText(/Nomination ID/i);
    fireEvent.change(pickInput, { target: { value: "12" } });
    const submitBtn = screen.getByRole("button", { name: /Submit pick/i });
    fireEvent.click(submitBtn);

    await screen.findByText(/Pick submitted/);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(screen.getByText(/Status: IN_PROGRESS/)).toBeInTheDocument();
    expect(screen.getByText(/Nomination 12/)).toBeInTheDocument();
  });
});
