import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MantineProvider } from "@ui";
import { MemoryRouter } from "react-router-dom";
import { AdminAnnouncementsScreen } from "@/features/admin/screens/content/AdminAnnouncementsScreen";
import type { AnnouncementFilter } from "@/decisions/adminContent";
import type { CmsDynamicRow } from "@/orchestration/adminContent";

afterEach(cleanup);

function entry(partial: Partial<CmsDynamicRow> & Pick<CmsDynamicRow, "id" | "key">) {
  return {
    title: `Entry ${partial.id}`,
    body_markdown: "",
    status: "DRAFT",
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    published_at: null,
    ...partial
  } as CmsDynamicRow;
}

const ENTRIES: CmsDynamicRow[] = [
  entry({ id: 1, key: "home_main", title: "Live update", status: "PUBLISHED" }),
  entry({ id: 2, key: "home_main", title: "Next update" }),
  entry({
    id: 3,
    key: "banner",
    title: "Voting closes",
    status: "PUBLISHED",
    ends_at: "2026-12-01T00:00:00Z"
  }),
  entry({ id: 4, key: "banner", title: "" })
];

function renderList(filter: AnnouncementFilter = "all", entries = ENTRIES) {
  const handlers = {
    onFilterChange: vi.fn(),
    onCreate: vi.fn(),
    onPublish: vi.fn(),
    onUnpublish: vi.fn()
  };
  render(
    <MantineProvider>
      <MemoryRouter>
        <AdminAnnouncementsScreen
          loading={false}
          busy={false}
          status={null}
          entries={entries}
          filter={filter}
          {...handlers}
        />
      </MemoryRouter>
    </MantineProvider>
  );
  return handlers;
}

function rowFor(title: string) {
  const item = screen.getByText(title).closest("li");
  if (!item) throw new Error(`no row for ${title}`);
  return within(item);
}

describe("AdminAnnouncementsScreen", () => {
  it("lists Home and banner entries together with their type and status", () => {
    renderList();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(rowFor("Live update").getByText(/^Home • Published/)).toBeTruthy();
    expect(rowFor("Next update").getByText(/^Home • Draft/)).toBeTruthy();
    expect(rowFor("Voting closes").getByText(/^Banner • Published • Ends /)).toBeTruthy();
    expect(rowFor("(untitled)").getByText(/^Banner • Draft/)).toBeTruthy();
  });

  it("shows only the filtered type", () => {
    renderList("banner");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByText("Live update")).toBeNull();
    expect(screen.getByText("Voting closes")).toBeTruthy();
  });

  it("reports filter changes", () => {
    const h = renderList();
    fireEvent.click(screen.getByText("Home"));
    expect(h.onFilterChange).toHaveBeenCalledWith("home");
  });

  it("keeps the published Home entry up: it can be replaced but not unpublished", () => {
    renderList();
    const live = rowFor("Live update");
    expect(live.queryByRole("button", { name: /Unpublish/ })).toBeNull();
    expect(live.queryByRole("button", { name: /Publish/ })).toBeNull();
    expect(
      live.getByRole("link", { name: "Edit Live update" }).getAttribute("href")
    ).toBe("/admin/content/dynamic/home_main/drafts/1");
  });

  it("publishes drafts and unpublishes banners", () => {
    const h = renderList();
    fireEvent.click(screen.getByRole("button", { name: "Publish Next update" }));
    expect(h.onPublish).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
    fireEvent.click(screen.getByRole("button", { name: "Unpublish Voting closes" }));
    expect(h.onUnpublish).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
  });

  it("creates either type", () => {
    const h = renderList();
    fireEvent.click(screen.getByRole("button", { name: "New Home announcement" }));
    fireEvent.click(screen.getByRole("button", { name: "New banner" }));
    expect(h.onCreate.mock.calls).toEqual([["home"], ["banner"]]);
  });

  it("names the empty filtered list", () => {
    renderList("home", [ENTRIES[3]]);
    expect(screen.getByText("No Home announcements yet.")).toBeTruthy();
  });
});
