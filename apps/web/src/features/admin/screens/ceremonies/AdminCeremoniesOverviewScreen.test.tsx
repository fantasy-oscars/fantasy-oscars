import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { screen } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@ui";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { AdminCeremoniesOverviewScreen } from "./AdminCeremoniesOverviewScreen";

describe("<AdminCeremoniesOverviewScreen />", () => {
  it("does not crash when typing in the name field", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    function Harness() {
      // Minimal parent state for the controlled inputs.
      const [form, setForm] = React.useState({
        code: "",
        name: "",
        startsAtLocal: "",
        warningHours: "24"
      });

      return (
        <AdminCeremoniesOverviewScreen
          loading={false}
          saving={false}
          loadError={null}
          status={null}
          ceremony={{
            id: 1,
            status: "DRAFT",
            code: null,
            name: null,
            starts_at: null,
            draft_locked_at: null,
            draft_warning_hours: 24,
            published_at: null,
            archived_at: null
          }}
          stats={{ nominees_total: 0, winners_total: 0 }}
          form={form}
          setForm={setForm}
          readOnly={false}
          onSave={onSave}
        />
      );
    }

    render(
      <MantineProvider>
        <MemoryRouter>
          <Harness />
        </MemoryRouter>
      </MantineProvider>
    );

    const input = screen.getByLabelText("Name");
    await user.type(input, "Oscars 2026");
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Oscars 2026")).toBeInTheDocument();
  });
});
