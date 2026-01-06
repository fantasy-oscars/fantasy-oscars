import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("<App />", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the heading", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "Sign up, sign in, and recover access" })
    ).toBeInTheDocument();
  });

  it("submits register form and shows success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({})
    });
    vi.stubGlobal("fetch", fetchMock);

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
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    const loginCard = screen
      .getAllByRole("heading", { name: "Login" })[0]
      .closest("section")!;

    fireEvent.click(within(loginCard).getByRole("button", { name: /Login/i }));

    await waitFor(() => {
      const required = within(loginCard).getAllByText(/Required/i, { selector: "small" });
      expect(required.length).toBeGreaterThan(0);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits reset confirm with token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({})
    });
    vi.stubGlobal("fetch", fetchMock);
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

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.token).toBe("t-123");
    expect(body.password).toBe("newpass");
  });
});
