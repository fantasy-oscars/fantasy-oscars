import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { screen } from "@testing-library/dom";
import { MantineProvider } from "@ui";
import { MemoryRouter } from "react-router-dom";
import { AdminHomeScreen } from "@/features/admin/screens/AdminHomeScreen";

afterEach(cleanup);

describe("<AdminHomeScreen />", () => {
  it("lists Circuits under Game Content", () => {
    render(
      <MantineProvider>
        <MemoryRouter>
          <AdminHomeScreen isSuperAdmin={false} />
        </MemoryRouter>
      </MantineProvider>
    );
    const card = screen.getByRole("heading", { name: "Game Content" }).parentElement;
    expect(card).not.toBeNull();
    const link = screen.getByRole("link", { name: "Circuits" });
    expect(card).toContainElement(link);
    expect(link).toHaveAttribute("href", "/admin/circuits");
    expect(
      screen.getByText("Season-long competitions across several ceremonies.")
    ).toBeInTheDocument();
  });
});
