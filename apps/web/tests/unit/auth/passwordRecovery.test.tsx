import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MantineProvider } from "@ui";
import { ForgotPasswordPage } from "@/app/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "@/app/pages/ResetPasswordPage";
import { LoginScreen } from "@/features/auth/screens/LoginScreen";

const refresh = vi.fn(() => Promise.resolve());
vi.mock("@/auth/context", () => ({ useAuthContext: () => ({ refresh }) }));

const notify = vi.fn();
vi.mock("@/notifications", () => ({ notify: (event: unknown) => notify(event) }));

type Reply = { status: number; body: unknown };

function stubFetch(reply: Reply) {
  const calls: Array<{ url: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: unknown, init?: RequestInit) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body ?? "{}")) });
      return Promise.resolve({
        ok: reply.status < 400,
        status: reply.status,
        json: () => Promise.resolve(reply.body)
      });
    })
  );
  return calls;
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderAt(path: string, element: React.ReactNode) {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={path.split("?")[0]} element={element} />
          <Route path="/login" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>
  );
}

function submit(button: string) {
  fireEvent.click(screen.getByRole("button", { name: button }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refresh.mockClear();
  notify.mockClear();
  window.history.replaceState(null, "", "/");
  document.head.querySelectorAll('meta[name="referrer"]').forEach((m) => m.remove());
});

describe("login screen", () => {
  it("links to the forgot-password screen", () => {
    render(
      <MantineProvider>
        <MemoryRouter>
          <LoginScreen
            errors={{}}
            result={null}
            loading={false}
            onInput={() => undefined}
            onSubmit={() => undefined}
          />
        </MemoryRouter>
      </MantineProvider>
    );
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute(
      "href",
      "/forgot-password"
    );
  });
});

describe("forgot-password screen", () => {
  it("validates the address before sending anything", async () => {
    const calls = stubFetch({ status: 200, body: { ok: true } });
    renderAt("/forgot-password", <ForgotPasswordPage />);
    const email = screen.getByLabelText("Email");
    fireEvent.change(email, { target: { value: "not-an-email" } });
    // Submitted directly: the browser's own type="email" check would stop a click first.
    fireEvent.submit(email.closest("form") as HTMLFormElement);
    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("shows the same confirmation whatever the outcome, with a spam-folder hint", async () => {
    const calls = stubFetch({ status: 200, body: { ok: true } });
    renderAt("/forgot-password", <ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: " someone@example.com " }
    });
    submit("Send reset link");
    expect(
      await screen.findByText(
        "If an account uses that address, we've sent a link. It expires in an hour."
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/check your spam or junk folder/i)).toBeInTheDocument();
    expect(calls).toEqual([
      {
        url: expect.stringContaining("/auth/password-reset/request"),
        body: { email: "someone@example.com" }
      }
    ]);
  });
});

describe("reset-password screen", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/reset-password?token=raw-token-value");
  });

  it("removes the token from the address bar as soon as it has read it", () => {
    stubFetch({ status: 204, body: {} });
    renderAt("/reset-password?token=raw-token-value", <ResetPasswordPage />);
    expect(window.location.pathname).toBe("/reset-password");
    expect(window.location.search).toBe("");
    expect(window.location.href).not.toContain("raw-token-value");
  });

  it("tells the browser to send no Referer from the page", () => {
    stubFetch({ status: 204, body: {} });
    renderAt("/reset-password?token=raw-token-value", <ResetPasswordPage />);
    expect(document.head.querySelector('meta[name="referrer"]')).toHaveAttribute(
      "content",
      "no-referrer"
    );
  });

  it("requires a matching confirmation", async () => {
    const calls = stubFetch({ status: 204, body: {} });
    renderAt("/reset-password?token=raw-token-value", <ResetPasswordPage />);
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-secret-1" }
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "new-secret-2" }
    });
    submit("Save new password");
    expect(await screen.findByText("Passwords don't match")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("sends the token with the new password, signs out and goes to sign in", async () => {
    const calls = stubFetch({ status: 204, body: {} });
    renderAt("/reset-password?token=raw-token-value", <ResetPasswordPage />);
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-secret-1" }
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "new-secret-1" }
    });
    submit("Save new password");
    expect(await screen.findByTestId("location")).toHaveTextContent("/login");
    expect(calls).toEqual([
      {
        url: expect.stringContaining("/auth/password-reset/confirm"),
        body: { token: "raw-token-value", password: "new-secret-1" }
      }
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Your password has been changed. Sign in with your new password."
      })
    );
  });

  it("explains an invalid or expired link and offers a new one", async () => {
    stubFetch({
      status: 400,
      body: { error: { code: "INVALID_RESET_TOKEN", message: "invalid" } }
    });
    renderAt("/reset-password?token=raw-token-value", <ResetPasswordPage />);
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-secret-1" }
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "new-secret-1" }
    });
    submit("Save new password");
    expect(
      await screen.findByText("This reset link is invalid or has expired.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ask for a new link" })).toHaveAttribute(
      "href",
      "/forgot-password"
    );
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    await waitFor(() => expect(refresh).not.toHaveBeenCalled());
  });

  it("treats a link without a token as invalid", () => {
    window.history.replaceState(null, "", "/reset-password");
    renderAt("/reset-password", <ResetPasswordPage />);
    expect(
      screen.getByText("This reset link is invalid or has expired.")
    ).toBeInTheDocument();
  });
});
