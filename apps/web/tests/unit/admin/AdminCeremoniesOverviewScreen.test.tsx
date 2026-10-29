import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { screen } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@ui";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { useFieldErrors } from "@/orchestration/useFieldErrors";
import { AdminCeremoniesOverviewScreen } from "@/features/admin/screens/ceremonies/AdminCeremoniesOverviewScreen";

afterEach(cleanup);

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
          fieldErrors={{}}
          onEditField={() => {}}
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

describe("<AdminCeremoniesOverviewScreen /> server field errors", () => {
  it("shows a server validation message on its input and clears it on edit", async () => {
    const user = userEvent.setup();
    const message = "Draft warning must be a whole number of hours, up to 336";

    function Harness() {
      const [form, setForm] = React.useState({
        code: "oscars",
        name: "Oscars",
        startsAtLocal: "",
        warningHours: "24"
      });
      const fe = useFieldErrors();

      return (
        <>
          <button
            type="button"
            onClick={() =>
              fe.applyFailure(
                {
                  errorCode: "VALIDATION_ERROR",
                  errorFields: ["draft_warning_hours"],
                  error: message
                },
                { draft_warning_hours: "warningHours" }
              )
            }
          >
            fail
          </button>
          <AdminCeremoniesOverviewScreen
            loading={false}
            saving={false}
            loadError={null}
            status={null}
            ceremony={{
              id: 1,
              status: "DRAFT",
              code: "oscars",
              name: "Oscars",
              starts_at: null,
              draft_locked_at: null,
              draft_warning_hours: 24,
              published_at: null,
              archived_at: null
            }}
            stats={{ nominees_total: 0, winners_total: 0 }}
            form={form}
            setForm={setForm}
            fieldErrors={fe.errors}
            onEditField={fe.clear}
            readOnly={false}
            onSave={() => {}}
          />
        </>
      );
    }

    render(
      <MantineProvider>
        <MemoryRouter>
          <Harness />
        </MemoryRouter>
      </MantineProvider>
    );

    expect(screen.queryByText(message)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "fail" }));
    expect(screen.getByText(message)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Draft warning (hours)"), "5");
    expect(screen.queryByText(message)).not.toBeInTheDocument();
  });
});
