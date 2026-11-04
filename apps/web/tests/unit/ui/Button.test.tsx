import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MantineProvider } from "@ui";
import { Button } from "@/ui/Button";
import { SeasonManagementColumn } from "@/features/seasons/ui/SeasonManagementColumn";

afterEach(cleanup);

function renderButton(props: Parameters<typeof Button>[0]) {
  render(
    <MantineProvider>
      <Button {...props}>Go</Button>
    </MantineProvider>
  );
  return screen.getByRole("button", { name: "Go" });
}

describe("ui/Button", () => {
  it.each([
    ["primary", "primary"],
    ["secondary", "secondary"],
    ["ghost", "ghost"],
    ["danger", "danger"],
    ["destructive", "destructive"],
    ["filled", "primary"],
    ["outline", "secondary"],
    ["subtle", "ghost"]
  ] as const)("variant %s sets data-fo-variant=%s", (variant, semantic) => {
    expect(renderButton({ variant }).getAttribute("data-fo-variant")).toBe(semantic);
  });

  it("defaults to secondary", () => {
    expect(renderButton({}).getAttribute("data-fo-variant")).toBe("secondary");
  });

  it("keeps the variant while loading and sets aria-busy", () => {
    const btn = renderButton({ variant: "danger", loading: true });
    expect(btn.getAttribute("data-fo-variant")).toBe("danger");
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.hasAttribute("data-loading")).toBe(true);
  });

  it("does not set aria-busy when idle", () => {
    expect(renderButton({}).hasAttribute("aria-busy")).toBe(false);
  });

  it("keeps the variant while disabled (the disabled well wins in CSS)", () => {
    const btn = renderButton({ variant: "primary", disabled: true });
    expect(btn.getAttribute("data-fo-variant")).toBe("primary");
    expect(btn.hasAttribute("disabled")).toBe(true);
    expect(btn.hasAttribute("data-loading")).toBe(false);
  });
});

describe("SeasonManagementColumn locked reason", () => {
  it("links both locked buttons to one visible helper line", () => {
    render(
      <MantineProvider>
        <SeasonManagementColumn
          isLocked
          isDeleteLocked={false}
          working={false}
          onOpenInvites={() => undefined}
          onOpenDraftSettings={() => undefined}
          onOpenDelete={() => undefined}
        />
      </MantineProvider>
    );
    const note = screen.getByText(
      "Participants and draft settings are locked once drafting starts."
    );
    for (const name of ["Manage participants", "Adjust draft settings"]) {
      const btn = screen.getByRole("button", { name });
      expect(btn.hasAttribute("disabled")).toBe(true);
      expect(btn.getAttribute("aria-describedby")).toBe(note.id);
    }
  });
});
