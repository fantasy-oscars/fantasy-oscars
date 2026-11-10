import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { MantineProvider } from "@ui";
import { AuthLayout } from "@/app/layouts/AuthLayout";

afterEach(cleanup);

describe("auth layout header", () => {
  it("holds the wordmark alone, with no mode toggle", () => {
    render(
      <MantineProvider>
        <MemoryRouter>
          <AuthLayout />
        </MemoryRouter>
      </MantineProvider>
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link").length).toBeGreaterThan(0);
  });
});
