import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { screen, within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@ui";
import { MemoryRouter } from "react-router-dom";
import { useState, type ReactNode } from "react";
import { AdminCircuitDetailScreen } from "@/features/admin/screens/circuit/AdminCircuitDetailScreen";
import { AdminCeremonyCircuitScreen } from "@/features/admin/screens/ceremonies/AdminCeremonyCircuitScreen";
import type {
  CircuitCeremony,
  CircuitDetail,
  CircuitReadiness
} from "@/orchestration/adminCircuit";
import type { CircuitEditorTab } from "@/features/admin/ui/circuit/CircuitEditorTabs";

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
  eventName: string,
  isGroup = false,
  sortIndex = 0
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
  event_is_group: isGroup,
  sort_index: sortIndex,
  nominations_on: id === 7 ? "2027-01-15" : null,
  starts_at: null,
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
    {
      id: 11,
      circuit_id: 3,
      code: "gg",
      name: "Golden Globes 2027",
      sort_index: 0,
      is_group: false
    },
    {
      id: 12,
      circuit_id: 3,
      code: "guilds",
      name: "Guilds",
      sort_index: 1,
      is_group: true
    }
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
      icon_code: "movie",
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
      icon_id: 2,
      icon_code: "theaters",
      icon_variant: "default"
    }
  ],
  ceremonies: [
    ceremony(7, "Golden Globes 2027", 11, "Golden Globes 2027"),
    ceremony(8, "SAG 2027", 12, "Guilds", true, 0),
    ceremony(9, "PGA 2027", 12, "Guilds", true, 1)
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
  initialized_leagues: [],
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
  ],
  waiver_windows: [
    {
      starts_on: "2027-01-15",
      ends_on: "2027-01-17",
      resolves_on: "2027-01-18",
      scoring_days: ["2027-01-15"]
    }
  ]
};

function renderDetail(
  overrides: Partial<Parameters<typeof AdminCircuitDetailScreen>[0]> = {},
  initialTab: CircuitEditorTab = "ceremonies"
) {
  const props = {
    state: "ready" as const,
    error: null,
    detail: DETAIL,
    readiness: null,
    ceremonies: [
      { id: 7, name: "Golden Globes 2027", code: "gg-2027" },
      { id: 10, name: "BAFTA 2027", code: "bafta-2027" }
    ],
    templates: [
      { id: 40, code: "actor", name: "Lead Actor", default_unit_kind: "PERFORMANCE" }
    ],
    iconCodes: ["face", "movie", "theaters"],
    working: false,
    status: null,
    activationMissing: null,
    ceremonyActions: {
      add: vi.fn(() => Promise.resolve(true)),
      remove: vi.fn(),
      addGroup: vi.fn(() => Promise.resolve(true)),
      renameGroup: vi.fn(() => Promise.resolve(true)),
      deleteGroup: vi.fn(),
      applyLayout: vi.fn(() => Promise.resolve(true)),
      saveMappings: vi.fn(() => Promise.resolve(true))
    },
    categoryActions: {
      add: vi.fn(() => Promise.resolve(true)),
      rename: vi.fn(() => Promise.resolve(true)),
      setIcon: vi.fn(() => Promise.resolve(true)),
      reorder: vi.fn(() => Promise.resolve(true)),
      remove: vi.fn()
    },
    onPublish: vi.fn(),
    onWithdraw: vi.fn(),
    onActivate: vi.fn(),
    ...overrides
  };
  function Harness() {
    const [tab, setTab] = useState<CircuitEditorTab>(initialTab);
    return <AdminCircuitDetailScreen {...props} tab={tab} onTabChange={setTab} />;
  }
  wrap(<Harness />);
  return props;
}

describe("<AdminCircuitDetailScreen />", () => {
  it("has Categories, Ceremonies, Schedule and Readiness tabs, switched by click or arrow keys", async () => {
    const user = userEvent.setup();
    renderDetail({}, "categories");
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      "Categories",
      "Ceremonies",
      "Schedule",
      "Readiness"
    ]);
    expect(screen.getByRole("tab", { name: "Categories" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Categories");
    expect(screen.getByRole("list", { name: "Circuit categories" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Ceremonies" }));
    expect(screen.getByRole("list", { name: "Circuit ceremonies" })).toBeInTheDocument();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Schedule" })).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Schedule");
  });

  it("lists single ceremonies as rows and groups as named, collapsible containers", async () => {
    const user = userEvent.setup();
    renderDetail();
    const list = screen.getByRole("list", { name: "Circuit ceremonies" });
    expect(
      within(list).getByRole("link", { name: "Golden Globes 2027" })
    ).toHaveAttribute("href", "/admin/ceremonies/7/overview");
    // The single ceremony's own event is not shown as a group.
    expect(
      screen.queryByRole("listitem", { name: "Group: Golden Globes 2027" })
    ).toBeNull();
    const group = screen.getByRole("listitem", { name: "Group: Guilds" });
    expect(within(group).getByText("Group · 2 ceremonies")).toBeInTheDocument();
    const inGroup = within(group).getByRole("list", { name: "Ceremonies in Guilds" });
    expect(
      within(inGroup)
        .getAllByRole("link")
        .map((l) => l.textContent)
    ).toEqual(["SAG 2027", "PGA 2027"]);

    const toggle = within(group).getByRole("button", {
      name: "Guilds, group of 2 ceremonies"
    });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(group).queryByRole("link", { name: "SAG 2027" })).toBeNull();
    expect(within(group).getByText("2 ceremonies hidden.")).toBeInTheDocument();
  });

  it("adds a ceremony from a modal, ungrouped", async () => {
    const user = userEvent.setup();
    const props = renderDetail();
    await user.click(screen.getByRole("button", { name: "Add ceremony" }));
    const addCeremony = await screen.findByRole("dialog", { name: "Add a ceremony" });
    await user.click(within(addCeremony).getByRole("textbox", { name: "Ceremony" }));
    // Only ceremonies not yet in the Circuit are offered.
    expect(
      screen.queryByRole("option", { name: "Golden Globes 2027", hidden: true })
    ).toBeNull();
    await user.click(
      await screen.findByRole("option", { name: "BAFTA 2027", hidden: true })
    );
    await user.click(within(addCeremony).getByRole("button", { name: "Add ceremony" }));
    expect(props.ceremonyActions.add).toHaveBeenCalledWith(10);
  });

  it("adds an empty, named group from a modal", async () => {
    const user = userEvent.setup();
    const props = renderDetail();
    await user.click(screen.getByRole("button", { name: "Add group" }));
    const addGroup = await screen.findByRole("dialog", { name: "Add a group" });
    const submit = within(addGroup).getByRole("button", { name: "Add group" });
    expect(submit).toBeDisabled();
    await user.click(within(addGroup).getByLabelText(/Group name/));
    await user.paste("Guild Awards");
    await user.click(submit);
    expect(props.ceremonyActions.addGroup).toHaveBeenCalledWith("Guild Awards");
  });

  it("moves ceremonies into and out of groups from the row menu", async () => {
    const user = userEvent.setup();
    const props = renderDetail();
    await openMenu(user, "More actions for Golden Globes 2027");
    expect(menuItem("Move up")).toBeDisabled();
    fireEvent.click(menuItem("Move into Guilds"));
    expect(props.ceremonyActions.applyLayout).toHaveBeenCalledWith({
      kind: "moveCeremony",
      ceremonyId: 7,
      groupId: 12,
      index: 2
    });
    await waitForLayoutSaved();

    await openMenu(user, "More actions for PGA 2027");
    fireEvent.click(menuItem("Move out of the group"));
    expect(props.ceremonyActions.applyLayout).toHaveBeenLastCalledWith({
      kind: "moveCeremony",
      ceremonyId: 9,
      groupId: null,
      index: 2
    });
  });

  it("offers a drag handle on every row and group, and group actions in a menu", async () => {
    const user = userEvent.setup();
    const props = renderDetail();
    expect(
      screen.getByRole("button", { name: "Move Golden Globes 2027" })
    ).toHaveAttribute("aria-roledescription", "draggable");
    expect(screen.getByRole("button", { name: "Move group Guilds" })).toBeInTheDocument();
    await openMenu(user, "More actions for Guilds");
    fireEvent.click(menuItem("Move up"));
    expect(props.ceremonyActions.applyLayout).toHaveBeenCalledWith({
      kind: "reorderEvents",
      eventIds: [12, 11]
    });
  });

  it("maps several ceremony categories to one Circuit category in the modal", async () => {
    const user = userEvent.setup();
    const props = renderDetail();
    await user.click(
      screen.getByRole("button", { name: "Map categories for Golden Globes 2027" })
    );
    const modal = await screen.findByRole("dialog", {
      name: "Map categories: Golden Globes 2027"
    });
    const rows = within(modal).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    // Both Golden Globes lead-actor categories feed Actor: one saved, one a
    // template match that is pre-selected but not saved.
    expect(within(rows[0]!).getByText("Best Actor – Drama")).toBeInTheDocument();
    expect(
      within(rows[0]!).getByText("Best Actor – Musical or Comedy")
    ).toBeInTheDocument();
    expect(within(modal).getByText("1 unsaved change.")).toBeInTheDocument();

    // A category chosen for Actor is not offered for Picture.
    await user.click(within(rows[1]!).getByRole("textbox", { name: "Picture" }));
    expect(screen.queryByRole("option", { name: "Best Actor – Drama" })).toBeNull();
    expect(
      await screen.findByText("Every category is mapped elsewhere")
    ).toBeInTheDocument();

    await user.click(within(modal).getByRole("button", { name: "Save mappings" }));
    expect(props.ceremonyActions.saveMappings).toHaveBeenCalledWith(7, {});
  });

  it("adds categories from templates and reorders them from the keyboard", async () => {
    const user = userEvent.setup();
    const props = renderDetail({}, "categories");
    await user.click(screen.getByRole("button", { name: "Move Actor down" }));
    expect(props.categoryActions.reorder).toHaveBeenCalledWith([22, 21]);
    expect(screen.getByRole("button", { name: "Reorder Actor" })).toHaveAttribute(
      "aria-roledescription",
      "draggable"
    );
    // A flat list: no groups.
    expect(screen.queryByRole("button", { name: "Add group" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Add category" }));
    const modal = await screen.findByRole("dialog", { name: "Add a category" });
    await user.click(within(modal).getByRole("textbox", { name: /Category template/ }));
    await user.click(
      await screen.findByRole("option", { name: "Lead Actor", hidden: true })
    );
    await user.click(within(modal).getByRole("button", { name: "Add category" }));
    expect(props.categoryActions.add).toHaveBeenCalledWith(40);
  });

  it("changes a category's icon, offering none another category uses", async () => {
    const user = userEvent.setup();
    const props = renderDetail({}, "categories");
    await user.click(screen.getByRole("button", { name: "Change icon for Actor" }));
    const modal = await screen.findByRole("dialog", { name: "Icon for Actor" });
    const save = within(modal).getByRole("button", { name: "Save icon" });
    // The current icon is chosen, so there is nothing to save yet.
    expect(save).toBeDisabled();
    await user.click(within(modal).getByRole("textbox", { name: /Icon/ }));
    expect(
      await screen.findByRole("option", {
        name: "theaters (used by Picture)",
        hidden: true
      })
    ).toHaveAttribute("data-combobox-disabled", "true");
    await user.click(await screen.findByRole("option", { name: "face", hidden: true }));
    await user.click(save);
    expect(props.categoryActions.setIcon).toHaveBeenCalledWith(21, "face");
  });

  it("shows the schedule read-only: scoring days left, windows right, undated apart", () => {
    renderDetail({}, "schedule");
    const panel = screen.getByRole("tabpanel");
    expect(
      within(panel).getByText("Golden Globes 2027 · Nominations")
    ).toBeInTheDocument();
    expect(within(panel).getByText("Fri, Jan 15, 2027")).toBeInTheDocument();
    expect(within(panel).getByText(/Jan 15 – Jan 17/)).toBeInTheDocument();
    expect(
      within(panel).getByText(/as if every ceremony were enabled/)
    ).toBeInTheDocument();
    const needs = within(panel).getByRole("region", { name: "Needs dates" });
    expect(within(needs).getByText("Golden Globes 2027")).toBeInTheDocument();
    expect(within(needs).getByText("Missing: ceremony date")).toBeInTheDocument();
    expect(within(panel).queryAllByRole("button")).toEqual([]);
    expect(within(panel).queryAllByRole("textbox")).toEqual([]);
  });

  it("shows what is left to do and what each ceremony supplies, read-only", () => {
    const readiness: CircuitReadiness = {
      circuit: { id: 3, code: "c", name: "Awards Run", status: "ACTIVE" },
      ready: false,
      gaps: {
        missing_dates: [
          {
            ceremony_id: 7,
            ceremony_code: null,
            ceremony_name: "Golden Globes 2027",
            missing: ["results_on"]
          }
        ],
        ceremonies_without_mappings: [
          {
            ceremony_id: 9,
            ceremony_code: null,
            ceremony_name: "PGA 2027",
            circuit_event_id: 12
          }
        ],
        categories_without_ceremony: [{ id: 22, code: "anim", name: "Animated" }],
        unmapped_edition_count: 1,
        categories_without_icon: [{ id: 22, code: "anim", name: "Animated" }],
        shared_icons: [
          {
            icon_code: "movie",
            categories: [
              { id: 21, code: "actor", name: "Lead Actor" },
              { id: 23, code: "director", name: "Director" }
            ]
          }
        ]
      },
      coverage: {
        ceremonies: [
          {
            ceremony_id: 7,
            ceremony_code: null,
            ceremony_name: "Golden Globes 2027",
            circuit_event_id: 11,
            supplies: [
              {
                circuit_category_id: 21,
                code: "actor",
                name: "Lead Actor",
                edition_ids: [31, 32]
              }
            ],
            unmapped_editions: [{ id: 33, code: "score", name: "Best Score" }],
            edition_count: 3
          },
          {
            ceremony_id: 9,
            ceremony_code: null,
            ceremony_name: "PGA 2027",
            circuit_event_id: 12,
            supplies: [],
            unmapped_editions: [],
            edition_count: 0
          }
        ],
        categories_without_ceremony: [{ id: 22, code: "anim", name: "Animated" }]
      },
      occasions: [],
      waiver_windows: []
    };
    renderDetail({ readiness }, "readiness");
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("Not ready yet:")).toBeInTheDocument();
    expect(
      within(panel).getByText("Needs a date: Golden Globes 2027: ceremony date")
    ).toBeInTheDocument();
    expect(within(panel).getByText("Supplies no category: PGA 2027")).toBeInTheDocument();
    expect(within(panel).getByText("No ceremony supplies Animated")).toBeInTheDocument();
    const coverage = within(panel).getByRole("region", { name: "Coverage" });
    expect(within(coverage).getByText("Supplies: Lead Actor (2)")).toBeInTheDocument();
    expect(within(coverage).getByText("Not mapped: Best Score")).toBeInTheDocument();
    expect(
      within(coverage).getByText("Supplies no Circuit category.")
    ).toBeInTheDocument();
    // Icon flags sit apart from what blocks readiness.
    const icons = within(panel).getByRole("region", { name: "Category icons" });
    expect(
      within(icons).getByText(
        "Animated has no icon, so its pills show the neutral trophy"
      )
    ).toBeInTheDocument();
    expect(
      within(icons).getByText("Lead Actor, Director share the icon movie")
    ).toBeInTheDocument();
    expect(within(panel).queryAllByRole("button")).toEqual([]);
  });

  it("says a Circuit with no ceremonies is not ready, with the empty state shown once", () => {
    renderDetail(
      {
        readiness: {
          circuit: { id: 3, code: "c", name: "Awards Run", status: "DRAFT" },
          ready: false,
          gaps: {
            missing_dates: [],
            ceremonies_without_mappings: [],
            categories_without_ceremony: [],
            unmapped_edition_count: 0,
            categories_without_icon: [],
            shared_icons: []
          },
          coverage: { ceremonies: [] },
          occasions: [],
          waiver_windows: []
        }
      },
      "readiness"
    );
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("Not ready yet: add a ceremony.")).toBeInTheDocument();
    expect(within(panel).getAllByText("No ceremonies yet.")).toHaveLength(1);
    expect(
      within(panel).getByText("Every category has its own icon.")
    ).toBeInTheDocument();
  });

  it("says so when the readiness report could not be loaded", () => {
    renderDetail({ readiness: null }, "readiness");
    expect(
      screen.getByText("The readiness report could not be loaded.")
    ).toBeInTheDocument();
  });

  it("shows the ceremonies that lack dates and activates without waiting for them", async () => {
    const user = userEvent.setup();
    const props = renderDetail();
    expect(screen.getByText("Golden Globes 2027: ceremony date")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Activate Circuit" }));
    expect(props.onActivate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["DRAFT", ["Publish Circuit", "Activate Circuit"]],
    ["PUBLISHED", ["Withdraw", "Activate Circuit"]],
    ["ACTIVE", []],
    ["ARCHIVED", []]
  ])("%s offers %j", (status, offered) => {
    renderDetail({ detail: { ...DETAIL, circuit: { ...DETAIL.circuit, status } } });
    const all = ["Publish Circuit", "Withdraw", "Activate Circuit"];
    for (const name of all) {
      const button = screen.queryByRole("button", { name });
      if (offered.includes(name)) expect(button).toBeInTheDocument();
      else expect(button).toBeNull();
    }
  });

  it("publishes, withdraws and activates through the matching handler", async () => {
    const user = userEvent.setup();
    const draft = renderDetail();
    await user.click(screen.getByRole("button", { name: "Publish Circuit" }));
    expect(draft.onPublish).toHaveBeenCalledTimes(1);
    cleanup();

    const published = renderDetail({
      detail: { ...DETAIL, circuit: { ...DETAIL.circuit, status: "PUBLISHED" } }
    });
    expect(screen.getByRole("heading", { name: "Published" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Withdraw" }));
    expect(published.onWithdraw).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Activate Circuit" }));
    expect(published.onActivate).toHaveBeenCalledTimes(1);
  });

  it("shows the withdraw refusal, and disables the buttons while working", () => {
    const published = { ...DETAIL, circuit: { ...DETAIL.circuit, status: "PUBLISHED" } };
    renderDetail({
      detail: published,
      status: { ok: false, message: "Remove the 2 seasons set up for this first" }
    });
    expect(
      screen.getByText("Remove the 2 seasons set up for this first")
    ).toBeInTheDocument();
    cleanup();

    renderDetail({ detail: published, working: true });
    expect(screen.getByRole("button", { name: "Withdraw" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Activate Circuit" })).toBeDisabled();
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

  it("shows consistent empty states when nothing is set up", async () => {
    const user = userEvent.setup();
    renderDetail({
      detail: {
        ...DETAIL,
        ceremonies: [],
        events: [],
        categories: [],
        category_editions: [],
        occasions: [],
        waiver_windows: [],
        readiness: { missing_dates: [] },
        initialized_leagues: []
      }
    });
    expect(screen.getByText("No ceremonies yet.")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Categories" }));
    expect(
      screen.getByText("No categories yet. Add one from a template.")
    ).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Schedule" }));
    expect(screen.getByText("No ceremonies yet.")).toBeInTheDocument();
  });

  it("disables every edit on an archived Circuit", async () => {
    const user = userEvent.setup();
    renderDetail({
      detail: { ...DETAIL, circuit: { ...DETAIL.circuit, status: "ARCHIVED" } }
    });
    expect(screen.getByText("Archived Circuits are read-only.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add ceremony" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add group" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "More actions for SAG 2027" })
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move SAG 2027" })).toBeDisabled();
    await user.click(screen.getByRole("tab", { name: "Categories" }));
    expect(screen.getByRole("button", { name: "Add category" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove Actor" })).toBeDisabled();
  });
});

/** The list shows a move as saved once the write resolves. */
async function waitForLayoutSaved() {
  await screen.findByRole("button", { name: "More actions for PGA 2027" });
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/*
 * A menu item by name. jsdom closes Mantine's menu as soon as it opens, so
 * the items are found among hidden elements and clicked directly.
 */
async function openMenu(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole("button", { name: label }));
  await screen.findAllByRole("menuitem", { hidden: true });
}

function menuItem(name: string) {
  return screen.getByRole("menuitem", { name, hidden: true });
}

describe("<AdminCeremonyCircuitScreen />", () => {
  const association = {
    circuit_id: 3,
    circuit_code: "c-2027",
    circuit_name: "Awards Run 2027",
    circuit_status: "ACTIVE",
    circuit_event_id: 12,
    event_code: "guilds",
    event_name: "Guilds",
    event_is_group: true
  };
  const option = (id: number, name: string) => ({
    id,
    code: name.toLowerCase(),
    name,
    status: "DRAFT",
    events: DETAIL.events
  });

  it("only attaches and detaches: no event or group picker", async () => {
    const user = userEvent.setup();
    const onAssociate = vi.fn(() => Promise.resolve(true));
    const onRemove = vi.fn();
    wrap(
      <AdminCeremonyCircuitScreen
        state="ready"
        error={null}
        associations={[association]}
        circuitOptions={[option(3, "Awards Run 2027"), option(4, "Festival Run 2027")]}
        working={false}
        associationStatus={null}
        onAssociate={onAssociate}
        onRemove={onRemove}
      />
    );
    expect(screen.getByRole("link", { name: "Awards Run 2027" })).toHaveAttribute(
      "href",
      "/admin/circuits/3"
    );
    // A group's name is shown read-only; nothing chooses an event or a group.
    expect(screen.getByText("Guilds · ACTIVE")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Event/ })).toBeNull();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.queryByLabelText(/date/i)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Detach from Awards Run 2027" }));
    expect(onRemove).toHaveBeenCalledWith(3);

    const attach = screen.getByRole("button", { name: "Attach" });
    expect(attach).toBeDisabled();
    await user.click(screen.getByRole("textbox", { name: "Attach to a Circuit" }));
    // A Circuit it already feeds is not offered again.
    expect(
      screen.queryByRole("option", { name: "Awards Run 2027", hidden: true })
    ).toBeNull();
    await user.click(
      await screen.findByRole("option", { name: "Festival Run 2027", hidden: true })
    );
    await user.click(attach);
    expect(onAssociate).toHaveBeenCalledWith(4);
  });

  it("shows a single-ceremony association by its status alone", () => {
    wrap(
      <AdminCeremonyCircuitScreen
        state="ready"
        error={null}
        associations={[{ ...association, event_name: "SAG 2027", event_is_group: false }]}
        circuitOptions={[option(3, "Awards Run 2027")]}
        working={false}
        associationStatus={null}
        onAssociate={vi.fn(() => Promise.resolve(true))}
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    expect(screen.queryByText(/SAG 2027/)).toBeNull();
  });
});
