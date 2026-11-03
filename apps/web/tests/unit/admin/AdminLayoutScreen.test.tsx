import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { screen } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@ui";
import { MemoryRouter } from "react-router-dom";
import { AdminLayoutScreen } from "@/features/admin/screens/AdminLayoutScreen";

afterEach(cleanup);

describe("<AdminLayoutScreen /> Game Content menu", () => {
  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MantineProvider>
        <MemoryRouter initialEntries={["/admin"]}>
          <AdminLayoutScreen isSuperAdmin={false}>content</AdminLayoutScreen>
        </MemoryRouter>
      </MantineProvider>
    );
    const group = container.querySelector(".admin-navGroup");
    act(() => screen.getByRole("link", { name: /Game Content/ }).focus());
    expect(group).toHaveClass("is-open");
    await user.keyboard("{Escape}");
    expect(group).not.toHaveClass("is-open");
  });
});
