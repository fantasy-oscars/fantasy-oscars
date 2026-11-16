import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { screen, within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@ui";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { AdminSeriesDetailScreen } from "@/features/admin/screens/series/AdminSeriesDetailScreen";
import { AdminCeremonySeriesScreen } from "@/features/admin/screens/ceremonies/AdminCeremonySeriesScreen";
import type { SeriesDetail } from "@/orchestration/adminSeries";

afterEach(cleanup);

function wrap(node: ReactNode) {
  return render(
    <MantineProvider>
      <MemoryRouter>{node}</MemoryRouter>
    </MantineProvider>
  );
}

const DETAIL: SeriesDetail = {
  series: {
    id: 3,
    code: "s-2027",
    name: "Season 2027",
    status: "DRAFT",
    opens_on: null,
    activated_at: null
  },
  events: [
    {
      id: 11,
      series_id: 3,
      code: "GOLDEN_GLOBES",
      name: "Golden Globe Awards",
      sort_index: 1
    },
    { id: 12, series_id: 3, code: "BAFTA", name: "BAFTA Film Awards", sort_index: 3 }
  ],
  categories: [
    {
      id: 21,
      series_id: 3,
      code: "PICTURE",
      name: "Best Picture",
      kind: "FILM",
      sort_index: 0
    }
  ],
  ceremonies: [
    {
      series_id: 3,
      ceremony_id: 7,
      ceremony_code: "bafta-2027",
      ceremony_name: "BAFTA 2027",
      ceremony_status: "PUBLISHED",
      series_event_id: 12,
      event_code: "BAFTA",
      event_name: "BAFTA Film Awards",
      event_sort_index: 3,
      nominations_on: "2027-01-15",
      results_on: null
    }
  ],
  category_editions: [
    {
      id: 31,
      ceremony_id: 7,
      code: "best-film",
      name: "Best Film",
      sort_index: 0,
      series_category_id: 21
    }
  ],
  readiness: {
    missing_dates: [
      {
        ceremony_id: 7,
        ceremony_code: "bafta-2027",
        ceremony_name: "BAFTA 2027",
        missing: ["results_on"]
      }
    ]
  },
  occasions: [
    {
      ceremony_id: 7,
      ceremony_code: "bafta-2027",
      ceremony_name: "BAFTA 2027",
      series_event_id: 12,
      event_code: "BAFTA",
      kind: "NOMINATION",
      date: "2027-01-15"
    },
    {
      ceremony_id: 7,
      ceremony_code: "bafta-2027",
      ceremony_name: "BAFTA 2027",
      series_event_id: 12,
      event_code: "BAFTA",
      kind: "WIN",
      date: null
    }
  ]
};

function renderDetail(
  overrides: Partial<Parameters<typeof AdminSeriesDetailScreen>[0]> = {}
) {
  const props = {
    state: "ready" as const,
    error: null,
    detail: DETAIL,
    ceremonies: [
      { id: 7, name: "BAFTA 2027", code: "bafta-2027" },
      { id: 8, name: "Golden Globes 2027", code: "gg-2027" }
    ],
    working: false,
    status: null,
    activationMissing: null,
    onAssociate: vi.fn(() => Promise.resolve(true)),
    onRemove: vi.fn(),
    onSetMapping: vi.fn(),
    onActivate: vi.fn(),
    ...overrides
  };
  wrap(<AdminSeriesDetailScreen {...props} />);
  return props;
}

describe("<AdminSeriesDetailScreen />", () => {
  it("lists associations by event, the mapping and the schedule", () => {
    renderDetail();
    const ceremonies = screen.getByRole("region", { name: "Ceremonies" });
    expect(within(ceremonies).getByRole("link", { name: "BAFTA 2027" })).toHaveAttribute(
      "href",
      "/admin/ceremonies/7/overview"
    );
    expect(within(ceremonies).getByText("No ceremony yet.")).toBeInTheDocument();
    const mappings = screen.getByRole("region", { name: "Category mappings" });
    expect(within(mappings).getByRole("textbox", { name: "Best Film" })).toHaveValue(
      "Best Picture"
    );
    const schedule = screen.getByRole("region", { name: "Schedule" });
    expect(within(schedule).getByText("2027-01-15")).toBeInTheDocument();
    expect(within(schedule).getByText("No date")).toBeInTheDocument();
  });

  it("shows the ceremonies that lack dates and activates without waiting for them", async () => {
    const user = userEvent.setup();
    const props = renderDetail();
    expect(screen.getByText("BAFTA 2027: results date")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Activate Series" }));
    expect(props.onActivate).toHaveBeenCalledTimes(1);
  });

  it("reports the activation result and hides the activate action once active", () => {
    renderDetail({
      detail: { ...DETAIL, series: { ...DETAIL.series, status: "ACTIVE" } },
      activationMissing: DETAIL.readiness.missing_dates
    });
    expect(
      screen.getByText("Series activated. These ceremonies still need dates:")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activate Series" })).toBeNull();
  });

  it("removes a ceremony from the keyboard", async () => {
    const user = userEvent.setup();
    const props = renderDetail();
    screen.getByRole("button", { name: "Remove BAFTA 2027" }).focus();
    await user.keyboard("{Enter}");
    expect(props.onRemove).toHaveBeenCalledWith(7);
  });

  it("disables every edit on an archived Series", () => {
    renderDetail({
      detail: { ...DETAIL, series: { ...DETAIL.series, status: "ARCHIVED" } }
    });
    expect(screen.getByText("Archived Series are read-only.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove BAFTA 2027" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add ceremony" })).toBeDisabled();
  });
});

describe("<AdminCeremonySeriesScreen />", () => {
  it("saves dates and lists the Series this ceremony feeds", async () => {
    const user = userEvent.setup();
    const onSaveDates = vi.fn();
    wrap(
      <AdminCeremonySeriesScreen
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
            series_id: 3,
            series_code: "s-2027",
            series_name: "Season 2027",
            series_status: "ACTIVE",
            series_event_id: 12,
            event_code: "BAFTA",
            event_name: "BAFTA Film Awards"
          }
        ]}
        seriesOptions={[]}
        working={false}
        seriesStatus={null}
        onAssociate={vi.fn(() => Promise.resolve(true))}
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Nominations date")).toHaveValue("2027-01-15");
    expect(screen.getByRole("link", { name: "Season 2027" })).toHaveAttribute(
      "href",
      "/admin/series/3"
    );
    expect(screen.getByText("BAFTA Film Awards · ACTIVE")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to Series" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save dates" }));
    expect(onSaveDates).toHaveBeenCalledTimes(1);
  });
});
