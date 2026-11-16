import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MantineProvider } from "@ui";
import { MemoryRouter } from "react-router-dom";
import { AdminDynamicContentEditorScreen } from "@/features/admin/screens/content/AdminDynamicContentEditorScreen";
import type { CmsDynamicRow } from "@/orchestration/adminContent";

afterEach(cleanup);

const noop = () => {};

function renderEditor(opts: { isBanner: boolean; body: string }) {
  const contentKey = opts.isBanner ? "banner" : "home_main";
  const entry: CmsDynamicRow = {
    id: 1,
    key: contentKey,
    title: "Draft night",
    body_markdown: opts.body,
    status: "DRAFT",
    created_at: "2026-11-15T00:00:00Z",
    updated_at: "2026-11-15T00:00:00Z",
    published_at: null
  };
  return render(
    <MantineProvider>
      <MemoryRouter>
        <AdminDynamicContentEditorScreen
          contentKey={contentKey}
          meta={{ label: opts.isBanner ? "Banner messages" : "Home main" }}
          entryId={1}
          loading={false}
          busy={false}
          status={null}
          entry={entry}
          viewOnly={false}
          fields={{
            title: entry.title,
            setTitle: noop,
            body: opts.body,
            setBody: noop,
            variant: "info",
            setVariant: noop,
            dismissible: true,
            setDismissible: noop,
            startsAtLocal: "",
            setStartsAtLocal: noop,
            endsAtLocal: "",
            setEndsAtLocal: noop,
            isBanner: opts.isBanner
          }}
          onSave={noop}
          onActivate={noop}
          onDeactivate={noop}
          onDelete={noop}
        />
      </MemoryRouter>
    </MantineProvider>
  );
}

describe("<AdminDynamicContentEditorScreen /> live preview", () => {
  it("renders the body as it will appear on Home, under the update title", () => {
    renderEditor({ isBanner: false, body: "# Lead\n\n## Detail" });
    const preview = within(screen.getByRole("region", { name: "Preview" }));
    expect(preview.getByRole("heading", { name: "Lead", level: 4 })).toBeInTheDocument();
    expect(
      preview.getByRole("heading", { name: "Detail", level: 5 })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Variant")).not.toBeInTheDocument();
  });

  it("renders a banner body at the default levels and shows the banner fields", () => {
    renderEditor({ isBanner: true, body: "# Heads up" });
    const preview = within(screen.getByRole("region", { name: "Preview" }));
    expect(
      preview.getByRole("heading", { name: "Heads up", level: 2 })
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Body (Markdown)" })).toBeInTheDocument();
    expect(screen.getAllByLabelText("Variant").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Dismissible")).toBeChecked();
  });

  it("says so when there is nothing to preview", () => {
    renderEditor({ isBanner: false, body: "  " });
    expect(screen.getByText("Nothing to preview yet.")).toBeInTheDocument();
  });
});
