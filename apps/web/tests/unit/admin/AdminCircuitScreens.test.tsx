import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { screen, within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@ui";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { AdminCircuitDetailScreen } from "@/features/admin/screens/circuit/AdminCircuitDetailScreen";
import { AdminCeremonyCircuitScreen } from "@/features/admin/screens/ceremonies/AdminCeremonyCircuitScreen";
import type { CircuitCeremony, CircuitDetail } from "@/orchestration/adminCircuit";

afterEach(cleanup);

function wrap(node: ReactNode) {
  return render(
    <MantineProvider>
      <MemoryRouter>{node}</MemoryRouter>
    </MantineProvider>
  );
}

const ceremony = (
  id: number,
  name: string,
  eventId: number,
  eventName: string
): CircuitCeremony => ({
  circuit_id: 3,
  ceremony_id: id,
  ceremony_code: null,
  ceremony_name: name,
  ceremony_status: "PUBLISHED",
  circuit_event_id: eventId,
  event_code: eventName.toLowerCase(),
  event_name: eventName,
  event_sort_index: eventId,
  nominations_on: id === 7 ? "2027-01-15" : null,
  results_on: null
});

const DETAIL: CircuitDetail = {
  circuit: {
    id: 3,
    code: "c-2027",
    name: "Awards Run 2027",
    status: "DRAFT",
    opens_on: null,
    activated_at: null
  },
  events: [
    { id: 11, circuit_id: 3, code: "gg", name: "Golden Globes 2027", sort_index: 0 },
    { id: 12, circuit_id: 3, code: "guilds", name: "Guilds", sort_index: 1 }
  ],
  categories: [
    {
      id: 21,
      circuit_id: 3,
      code: "actor",
      name: "Actor",
      kind: "ACTING",
      sort_index: 0,
      category_family_id: 40,
      icon_id: 1,
      icon_code: "film",
      icon_variant: "default"
    },
    {
      id: 22,
      circuit_id: 3,
      code: "picture",
      name: "Picture",
      kind: "FILM",
      sort_index: 1,
      category_family_id: 41,
      icon_id: 1,
      icon_code: "film",
      icon_variant: "default"
    }
  ],
  ceremonies: [
    ceremony(7, "Golden Globes 2027", 11, "Golden Globes 2027"),
    ceremony(8, "SAG 2027", 12, "Guilds"),
    ceremony(9, "PGA 2027", 12, "Guilds")
  ],
  category_editions: [
    {
      id: 31,
      ceremony_id: 7,
      code: null,
      name: "Best Actor – Drama",
      sort_index: 0,
      family_id: 40,
      circuit_category_id: 21,
      suggested_circuit_category_id: 21
    },
    {
      id: 32,
      ceremony_id: 7,
      code: null,
      name: "Best Actor – Musical or Comedy",
      sort_index: 1,
      family_id: 40,
      circuit_category_id: null,
      suggested_circuit_category_id: 21
    }
  ],
  readiness: {
    missing_dates: [
      {
        ceremony_id: 7,
        ceremony_code: null,
        ceremony_name: "Golden Globes 2027",
        missing: ["results_on"]
      }
    ]
  },
  occasions: [
    {
      ceremony_id: 7,
      ceremony_code: null,
      ceremony_name: "Golden Globes 2027",
      circuit_event_id: 11,
      event_code: "gg",
      kind: "NOMINATION",
      date: "2027-01-15"
    },
    {
      ceremony_id: 7,
      ceremony_code: null,
      ceremony_name: "Golden Globes 2027",
      circuit_event_id: 11,
      event_code: "gg",
      kind: "WIN",
      date: null
    }
  ]
};

function renderDetail(
  overrides: Partial<Parameters<typeof AdminCircuitDetailScreen>[0]> = {}
) {
  const props = {
    state: "ready" as const,
    error: null,
    detail: DETAIL,
    ceremonies: [
      { id: 7, name: "Golden Globes 2027", code: "gg-2027" },
      { id: 10, name: "BAFTA 2027", code: "bafta-2027" }
    ],
    templates: [
      { id: 40, code: "actor", name: "Lead Actor", default_unit_kind: "PERFORMANCE" }
    ],
    mappingChoices: {},
    working: false,
    status: null,
    activationMissing: null,
    ceremonyActions: {
      place: vi.fn(() => Promise.resolve(true)),
      remove: vi.fn(),
      createEvent: vi.fn(() => Promise.resolve(true)),
      renameEvent: vi.fn(() => Promise.resolve(true)),
      moveEvent: vi.fn(),
      ungroupEvent: vi.fn()
    },
    categoryActions: {
      add: vi.fn(() => Promise.resolve(true)),
      rename: vi.fn(() => Promise.resolve(true)),
      move: vi.fn(),
      remove: vi.fn()
    },
    mappingActions: { choose: vi.fn(), save: vi.fn() },
    onActivate: vi.fn(),
    ...overrides
  };
  wrap(<AdminCircuitDetailScreen {...props} />);
  return props;
}

describe("<AdminCircuitDetailScreen />", () => {
  it("lists ceremonies by event, the categories, the mappings and the schedule", () => {
    renderDetail();
    const ceremonies = screen.getByRole("region", { name: "Ceremonies" });
    const guilds = within(ceremonies).getByRole("group", { name: "Event: Guilds" });
    expect(within(guilds).getByRole("link", { name: "SAG 2027" })).toHaveAttribute(
      "href",
      "/admin/ceremonies/8/overview"
    );
    expect(within(guilds).getByRole("button", { name: "Ungroup Guilds" })).toBeEnabled();
    // A one-ceremony event has nothing to ungroup.
    expect(
      within(ceremonies).queryByRole("button", { name: "Ungroup Golden Globes 2027" })
    ).toBeNull();

    const categories = screen.getByRole("region", { name: "Categories" });
    expect(within(categories).getByText("Acting")).toBeInTheDocument();
    expect(
      within(categories).getByRole("button", { name: "Move Actor up" })
    ).toBeDisabled();

    const schedule = screen.getByRole("region", { name: "Schedule" });
    expect(within(schedule).getByText("2027-01-15")).toBeInTheDocument();
    expect(within(schedule).getByText("No date")).toBeInTheDocument();
  });

  it("shows the pre-selected mapping as unsaved and every category mapped to Actor", async () => {
    const user = userEvent.setup();
    const props = renderDetail();
    const mappings = screen.getByRole("region", { name: "Category mappings" });
    expect(
      within(mappings).getByRole("textbox", { name: "Best Actor – Musical or Comedy" })
    ).toHaveValue("Actor");
    expect(within(mappings).getByText("Not saved")).toBeInTheDocument();
    expect(within(mappings).getByText("1 unsaved change.")).toBeInTheDocument();
    const summary = within(mappings).getByRole("group", {
      name: "Mapped to each Circuit category"
    });
    expect(
      within(summary).getByText(
        "Golden Globes 2027 · Best Actor – Drama; Golden Globes 2027 · Best Actor – Musical or Comedy (not saved)"
      )
    ).toBeInTheDocument();
    expect(within(summary).getByText("Nothing mapped yet.")).toBeInTheDocument();
    await user.click(within(mappings).getByRole("button", { name: "Save mappings" }));
    expect(props.mappingActions.save).toHaveBeenCalledTimes(1);
  });

  it("disables saving when every mapping is saved", () => {
    renderDetail({ mappingChoices: { 32: null } });
    const mappings = screen.getByRole("region", { name: "Category mappings" });
    expect(within(mappings).getByText("All mappings are saved.")).toBeInTheDocument();
    expect(
      within(mappings).getByRole("button", { name: "Save mappings" })
    ).toBeDisabled();
  });

  it("adds a ceremony without an event so it gets its own", async () => {
    const user = userEvent.setup();
    const props = renderDetail();
    const form = screen.getByRole("form", { name: "Add a ceremony" });
    await user.click(within(form).getByRole("textbox", { name: "Ceremony" }));
    await user.click(
      await screen.findByRole("option", { name: "BAFTA 2027", hidden: true })
    );
    await user.click(within(form).getByRole("button", { name: "Add ceremony" }));
    expect(props.ceremonyActions.place).toHaveBeenCalledWith(10, null);
  });

  it("renames an event and adds a category from a template", async () => {
    const user = userEvent.setup();
    const props = renderDetail();
    await user.click(screen.getByRole("button", { name: "Rename Guilds" }));
    const rename = screen.getByRole("form", { name: "Event name" });
    const input = within(rename).getByLabelText("Event name");
    await user.clear(input);
    await user.type(input, "Guild Awards");
    await user.click(within(rename).getByRole("button", { name: "Save" }));
    expect(props.ceremonyActions.renameEvent).toHaveBeenCalledWith(12, "Guild Awards");

    const add = screen.getByRole("form", { name: "Add a category" });
    await user.click(within(add).getByRole("textbox", { name: "Category template" }));
    await user.click(
      await screen.findByRole("option", { name: "Lead Actor", hidden: true })
    );
    await user.click(within(add).getByRole("button", { name: "Add category" }));
    expect(props.categoryActions.add).toHaveBeenCalledWith(40);
  });

  it("removes a ceremony and moves an event from the keyboard", async () => {
    const user = userEvent.setup();
    const props = renderDetail();
    screen.getByRole("button", { name: "Remove SAG 2027" }).focus();
    await user.keyboard("{Enter}");
    expect(props.ceremonyActions.remove).toHaveBeenCalledWith(8);
    screen.getByRole("button", { name: "Move Guilds up" }).focus();
    await user.keyboard("{Enter}");
    expect(props.ceremonyActions.moveEvent).toHaveBeenCalledWith(12, -1);
  });

  it("shows the ceremonies that lack dates and activates without waiting for them", async () => {
    const user = userEvent.setup();
    const props = renderDetail();
    expect(screen.getByText("Golden Globes 2027: results date")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Activate Circuit" }));
    expect(props.onActivate).toHaveBeenCalledTimes(1);
  });

  it("reports the activation result and hides the activate action once active", () => {
    renderDetail({
      detail: { ...DETAIL, circuit: { ...DETAIL.circuit, status: "ACTIVE" } },
      activationMissing: DETAIL.readiness.missing_dates
    });
    expect(
      screen.getByText("Circuit activated. These ceremonies still need dates:")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activate Circuit" })).toBeNull();
  });

  it("disables every edit on an archived Circuit", () => {
    renderDetail({
      detail: { ...DETAIL, circuit: { ...DETAIL.circuit, status: "ARCHIVED" } }
    });
    expect(screen.getByText("Archived Circuits are read-only.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove SAG 2027" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add ceremony" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove Actor" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create event" })).toBeDisabled();
  });
});

describe("<AdminCeremonyCircuitScreen />", () => {
  it("saves dates and lists the Circuits this ceremony feeds", async () => {
    const user = userEvent.setup();
    const onSaveDates = vi.fn();
    const onAssociate = vi.fn(() => Promise.resolve(true));
    wrap(
      <AdminCeremonyCircuitScreen
        state="ready"
        error={null}
        datesForm={{ nominationsOn: "2027-01-15", resultsOn: "" }}
        setDatesForm={vi.fn()}
        fieldErrors={{}}
        onEditField={vi.fn()}
        savingDates={false}
        datesStatus={null}
        onSaveDates={onSaveDates}
        associations={[
          {
            circuit_id: 3,
            circuit_code: "c-2027",
            circuit_name: "Awards Run 2027",
            circuit_status: "ACTIVE",
            circuit_event_id: 12,
            event_code: "guilds",
            event_name: "Guilds"
          }
        ]}
        circuitOptions={[
          {
            id: 3,
            code: "c-2027",
            name: "Awards Run 2027",
            status: "ACTIVE",
            events: DETAIL.events
          }
        ]}
        working={false}
        associationStatus={null}
        onAssociate={onAssociate}
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Nominations date")).toHaveValue("2027-01-15");
    expect(screen.getByRole("link", { name: "Awards Run 2027" })).toHaveAttribute(
      "href",
      "/admin/circuits/3"
    );
    expect(screen.getByText("Guilds · ACTIVE")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to Circuit" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save dates" }));
    expect(onSaveDates).toHaveBeenCalledTimes(1);

    // Moving the ceremony into another event of the same Circuit.
    await user.click(screen.getByRole("textbox", { name: "Event in Awards Run 2027" }));
    await user.click(
      await screen.findByRole("option", { name: "Golden Globes 2027", hidden: true })
    );
    expect(onAssociate).toHaveBeenCalledWith(3, 11);
  });
});
