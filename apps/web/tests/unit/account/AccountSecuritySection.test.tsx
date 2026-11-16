import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MantineProvider } from "@ui";
import { AccountSecuritySection } from "@/features/account/ui/AccountSecuritySection";
import { useAccountSecurityOrchestration } from "@/orchestration/account/orchestration";

const notify = vi.fn();
vi.mock("@/notifications", () => ({ notify: (event: unknown) => notify(event) }));

type Reply = { status: number; body: unknown };

function stubFetch(reply: Reply) {
  const calls: Array<{ url: string; method?: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: unknown, init?: RequestInit) => {
      calls.push({
        url: String(input),
        method: init?.method,
        body: JSON.parse(String(init?.body ?? "{}"))
      });
      return Promise.resolve({
        ok: reply.status < 400,
        status: reply.status,
        json: () => Promise.resolve(reply.body)
      });
    })
  );
  return calls;
}

function Harness(props: { onEmailChanged: () => Promise<void> }) {
  const security = useAccountSecurityOrchestration(props);
  return <AccountSecuritySection {...security} />;
}

function renderSection() {
  const onEmailChanged = vi.fn(() => Promise.resolve());
  render(
    <MantineProvider>
      <Harness onEmailChanged={onEmailChanged} />
    </MantineProvider>
  );
  return { onEmailChanged };
}

function card(name: string) {
  return within(screen.getByRole("region", { name }));
}

function fill(scope: ReturnType<typeof card>, label: string, value: string) {
  fireEvent.change(scope.getByLabelText(label), { target: { value } });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  notify.mockClear();
});

describe("account change password", () => {
  it("requires the current password before sending", async () => {
    const calls = stubFetch({ status: 204, body: {} });
    renderSection();
    const form = card("Change password");
    fill(form, "New password", "new-secret-1");
    fireEvent.click(form.getByRole("button", { name: "Change password" }));
    expect(await form.findByText("Required")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("sends both passwords and confirms with a toast", async () => {
    const calls = stubFetch({ status: 204, body: {} });
    renderSection();
    const form = card("Change password");
    fill(form, "Current password", "old-secret");
    fill(form, "New password", "new-secret-1");
    fireEvent.click(form.getByRole("button", { name: "Change password" }));
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ severity: "success", message: "Password changed" })
      )
    );
    expect(calls).toEqual([
      {
        url: expect.stringContaining("/auth/password"),
        method: "POST",
        body: { currentPassword: "old-secret", newPassword: "new-secret-1" }
      }
    ]);
    expect(form.getByLabelText("Current password")).toHaveValue("");
  });

  it("puts a wrong current password on its input", async () => {
    stubFetch({
      status: 400,
      body: {
        error: {
          code: "INVALID_CURRENT_PASSWORD",
          message: "Current password is incorrect",
          details: { fields: ["currentPassword"] }
        }
      }
    });
    renderSection();
    const form = card("Change password");
    fill(form, "Current password", "wrong");
    fill(form, "New password", "new-secret-1");
    fireEvent.click(form.getByRole("button", { name: "Change password" }));
    expect(await form.findByText("Current password is incorrect")).toBeInTheDocument();
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("account change email", () => {
  it("sends the new address with the current password and reloads the session", async () => {
    const calls = stubFetch({
      status: 200,
      body: { user: { email: "new@example.com" } }
    });
    const { onEmailChanged } = renderSection();
    const form = card("Change email");
    fill(form, "New email", " new@example.com ");
    fill(form, "Current password", "old-secret");
    fireEvent.click(form.getByRole("button", { name: "Change email" }));
    await waitFor(() => expect(onEmailChanged).toHaveBeenCalledTimes(1));
    expect(calls).toEqual([
      {
        url: expect.stringContaining("/auth/email"),
        method: "PATCH",
        body: { currentPassword: "old-secret", email: "new@example.com" }
      }
    ]);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "success", message: "Email updated" })
    );
  });

  it("puts an address already in use on the email input", async () => {
    stubFetch({
      status: 409,
      body: { error: { code: "USER_EXISTS", message: "exists" } }
    });
    const { onEmailChanged } = renderSection();
    const form = card("Change email");
    fill(form, "New email", "Taken@Example.com");
    fill(form, "Current password", "old-secret");
    fireEvent.click(form.getByRole("button", { name: "Change email" }));
    expect(
      await form.findByText("Another account already uses that email")
    ).toBeInTheDocument();
    expect(onEmailChanged).not.toHaveBeenCalled();
  });
});
