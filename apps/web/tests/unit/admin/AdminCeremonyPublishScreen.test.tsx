import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@ui";
import type { CeremonyStatus } from "@/decisions/ceremonyLifecycle";
import { canWithdrawCeremony } from "@/decisions/ceremonyLifecycle";
import { AdminCeremonyPublishScreen } from "@/features/admin/screens/ceremonies/AdminCeremonyPublishScreen";

afterEach(cleanup);

function renderPublish(
  status: CeremonyStatus,
  overrides: Partial<Parameters<typeof AdminCeremonyPublishScreen>[0]> = {}
) {
  const props = {
    loading: false,
    publishing: false,
    withdrawing: false,
    loadError: null,
    status: null,
    ceremony: { status },
    canPublish: status === "DRAFT",
    publishDisabledReason: null,
    canWithdraw: canWithdrawCeremony(status),
    onPublish: vi.fn(),
    onWithdraw: vi.fn(),
    ...overrides
  };
  render(
    <MantineProvider>
      <AdminCeremonyPublishScreen {...props} />
    </MantineProvider>
  );
  return props;
}

describe("AdminCeremonyPublishScreen", () => {
  it("offers Publish, not Withdraw, for a draft ceremony", () => {
    renderPublish("DRAFT");
    expect(screen.getByRole("button", { name: "Publish ceremony" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Withdraw" })).toBeNull();
  });

  it("offers Withdraw while published", async () => {
    const user = userEvent.setup();
    const props = renderPublish("PUBLISHED");
    expect(screen.queryByRole("button", { name: "Publish ceremony" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Withdraw" }));
    expect(props.onWithdraw).toHaveBeenCalledTimes(1);
  });

  it.each<CeremonyStatus>(["ACTIVE", "LOCKED", "ARCHIVED"])(
    "offers neither once %s",
    (status) => {
      renderPublish(status);
      expect(screen.queryByRole("button", { name: "Publish ceremony" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Withdraw" })).toBeNull();
    }
  );

  it("shows the withdraw refusal", () => {
    renderPublish("PUBLISHED", {
      status: { ok: false, message: "Remove the 1 season set up for this first" }
    });
    expect(
      screen.getByText("Remove the 1 season set up for this first")
    ).toBeInTheDocument();
  });

  it("disables Withdraw while it runs", () => {
    renderPublish("PUBLISHED", { withdrawing: true });
    expect(screen.getByRole("button", { name: "Withdrawing..." })).toBeDisabled();
  });
});
