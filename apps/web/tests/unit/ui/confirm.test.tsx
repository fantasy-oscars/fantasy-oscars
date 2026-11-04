import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { MantineProvider } from "@ui";
import { ConfirmProvider, confirm } from "@/notifications/confirm";

afterEach(cleanup);

function mount() {
  render(
    <MantineProvider>
      <ConfirmProvider>
        <div />
      </ConfirmProvider>
    </MantineProvider>
  );
}

describe("confirm dialog", () => {
  it("renders the confirm button as destructive for a danger confirm", async () => {
    mount();
    act(() => {
      void confirm({
        title: "Delete",
        message: "Sure?",
        confirmLabel: "Remove",
        danger: true
      });
    });
    const btn = await screen.findByRole("button", { name: "Remove" });
    expect(btn.getAttribute("data-fo-variant")).toBe("destructive");
  });

  it("renders the confirm button as primary otherwise", async () => {
    mount();
    act(() => {
      void confirm({ title: "Go", message: "Proceed?", confirmLabel: "Proceed" });
    });
    const btn = await screen.findByRole("button", { name: "Proceed" });
    await waitFor(() => expect(btn.getAttribute("data-fo-variant")).toBe("primary"));
  });
});
