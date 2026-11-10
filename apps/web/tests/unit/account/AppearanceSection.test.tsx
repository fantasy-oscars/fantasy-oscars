import { useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MantineProvider } from "@ui";
import { BRAND_IDS, type BrandId } from "@fantasy-oscars/shared/brands";
import { DEFAULT_APPEARANCE_SETTINGS } from "@fantasy-oscars/shared/appearance";
import {
  APPEARANCE_COPY,
  applyRandomListChange,
  deriveAppearanceView,
  type AppearanceState
} from "@/decisions/appearance";
import { AppearanceSection } from "@/features/account/ui/AppearanceSection";

afterEach(cleanup);

function view(
  patch: {
    discovered?: BrandId[];
    settings?: Partial<AppearanceState["settings"]>;
    fixedUnavailable?: boolean;
  } = {},
  enabled: readonly BrandId[] = BRAND_IDS
) {
  return deriveAppearanceView(
    {
      discovered: patch.discovered ?? [],
      draw: null,
      fixedUnavailable: patch.fixedUnavailable ?? false,
      settings: { ...DEFAULT_APPEARANCE_SETTINGS, ...patch.settings }
    },
    { enabled }
  );
}

function renderSection(props: Partial<Parameters<typeof AppearanceSection>[0]> = {}) {
  const handlers = {
    onModeChange: vi.fn(),
    onSelectionChange: vi.fn(),
    onFixedChange: vi.fn(),
    onRandomChange: vi.fn(),
    onPolicyChange: vi.fn(),
    onRetry: vi.fn()
  };
  render(
    <MantineProvider>
      <AppearanceSection
        view={view()}
        statusText=""
        failure={false}
        vertical={false}
        {...handlers}
        {...props}
      />
    </MantineProvider>
  );
  return handlers;
}

describe("AppearanceSection", () => {
  it("renders the section with its heading, Mode, Theme and the Random list", () => {
    renderSection();
    const section = screen.getByRole("region", { name: "Appearance" });
    expect(section).toHaveAttribute("id", "appearance");
    expect(within(section).getByRole("heading", { name: "Appearance" })).toHaveAttribute(
      "id",
      "appearance-title"
    );
    expect(screen.getByRole("radiogroup", { name: "Mode" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Theme default" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Random" })).toBeChecked();
    expect(screen.getByText(APPEARANCE_COPY.modeHelper)).toBeInTheDocument();
    expect(screen.getByText(APPEARANCE_COPY.randomHelper)).toBeInTheDocument();
    expect(screen.getByText(APPEARANCE_COPY.discoveryHelper)).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Themes with one mode" })).toBeNull();
  });

  it("keeps the status line in the page and announces it politely", () => {
    renderSection({ statusText: "Saving…" });
    const status = screen.getByText("Saving…");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("shows the failure message with Retry", async () => {
    const handlers = renderSection({ failure: true });
    expect(screen.getByText(APPEARANCE_COPY.saveFailed)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(handlers.onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows no failure message when a save has not failed", () => {
    renderSection();
    expect(screen.queryByText(APPEARANCE_COPY.saveFailed)).toBeNull();
  });

  it("stacks the Mode segments on a phone width", () => {
    renderSection({ vertical: true });
    const group = screen.getByRole("radiogroup", { name: "Mode" });
    expect(group).toHaveAttribute("data-orientation", "vertical");
    expect(screen.getByRole("radiogroup", { name: "Theme" })).not.toHaveAttribute(
      "data-orientation",
      "vertical"
    );
  });

  it("shows a Select under Fixed and no Random list", () => {
    renderSection({
      view: view({ discovered: ["noir"], settings: { fixed: "noir" } })
    });
    expect(screen.getByRole("radio", { name: "Fixed" })).toBeChecked();
    expect(screen.getByRole("textbox", { name: "Your theme" })).toHaveValue("Noir");
    expect(screen.queryByText("Themes to include")).toBeNull();
    expect(screen.getByText(APPEARANCE_COPY.fixedHelper)).toBeInTheDocument();
  });

  it("renders the single-mode control when the view asks for it", () => {
    const base = view();
    renderSection({
      view: {
        ...base,
        conflict: {
          value: "own",
          options: [
            { value: "own", label: "Use the theme's own mode" },
            { value: "exclude", label: "Leave those themes out" }
          ],
          helper: APPEARANCE_COPY.conflictHelper
        }
      }
    });
    expect(
      screen.getByRole("radiogroup", { name: "Themes with one mode" })
    ).toBeInTheDocument();
    expect(screen.getByText(APPEARANCE_COPY.conflictHelper)).toBeInTheDocument();
  });

  it("explains a single-mode Fixed theme and an unavailable one", () => {
    renderSection({
      view: {
        ...view(),
        mode: {
          ...view().mode,
          note: "Cinema B has one mode, so this setting doesn't change it."
        }
      }
    });
    expect(
      screen.getByText("Cinema B has one mode, so this setting doesn't change it.")
    ).toBeInTheDocument();
    cleanup();
    renderSection({ view: view({ fixedUnavailable: true }) });
    expect(screen.getByText(APPEARANCE_COPY.fixedUnavailable)).toBeInTheDocument();
  });

  it("the keyboard moves the Mode choice with the arrow keys", async () => {
    const handlers = renderSection({ view: view({ settings: { mode: "light" } }) });
    await userEvent.tab();
    expect(screen.getByRole("radio", { name: "Light" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(handlers.onModeChange).toHaveBeenLastCalledWith("dark");
  });

  it("the Theme control switches to Fixed from the keyboard", async () => {
    const handlers = renderSection();
    await userEvent.tab();
    await userEvent.tab();
    expect(screen.getByRole("radio", { name: "Random" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(handlers.onSelectionChange).toHaveBeenLastCalledWith("fixed");
  });

  it("Select: opens from the keyboard, skips group headings and chooses with Enter", async () => {
    const handlers = renderSection({
      view: view({ discovered: ["noir"], settings: { fixed: "refined-gold" } })
    });
    const field = screen.getByRole("textbox", { name: "Your theme" });
    field.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(
      await screen.findByRole("option", { name: "Noir", hidden: true })
    ).toBeInTheDocument();
    expect(screen.getByText("Ceremony")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(handlers.onFixedChange).toHaveBeenLastCalledWith("noir");
  });
});

describe("AppearanceSection: Random list", () => {
  function Harness(props: { discovered: BrandId[]; enabled?: readonly BrandId[] }) {
    const enabled = props.enabled ?? BRAND_IDS;
    const [state, setState] = useState<AppearanceState>({
      discovered: props.discovered,
      draw: null,
      fixedUnavailable: false,
      settings: { ...DEFAULT_APPEARANCE_SETTINGS }
    });
    return (
      <MantineProvider>
        <AppearanceSection
          view={deriveAppearanceView(state, { enabled })}
          statusText=""
          failure={false}
          vertical={false}
          onRetry={() => {}}
          onModeChange={() => {}}
          onSelectionChange={() => {}}
          onFixedChange={() => {}}
          onPolicyChange={() => {}}
          onRandomChange={(value) => {
            const patch = applyRandomListChange(state, value, { enabled });
            if (!patch) return;
            setState({
              ...state,
              settings: {
                ...state.settings,
                excluded: patch.random_excluded_brands ?? state.settings.excluded,
                undiscoveredEnabled:
                  patch.undiscovered_enabled ?? state.settings.undiscoveredEnabled
              }
            });
          }}
        />
      </MantineProvider>
    );
  }

  it("is reachable by Tab, opens with the arrow keys and toggles an option with Enter", async () => {
    render(<Harness discovered={["ballot", "noir"]} />);
    const field = screen.getByRole("textbox", { name: "Themes to include" });
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    expect(field).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    const options = await screen.findAllByRole("option", { hidden: true });
    expect(options.map((o) => o.textContent)).toEqual([
      "Undiscovered themes",
      "Refined Gold",
      "Ballot",
      "Noir"
    ]);
    expect(options.every((o) => o.getAttribute("aria-selected") === "true")).toBe(true);
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{Enter}");
    const pills = [...document.querySelectorAll(".mantine-MultiSelect-pill")].map(
      (pill) => pill.textContent
    );
    expect(pills).toEqual(["Undiscovered themes", "Refined Gold", "Ballot"]);
    await userEvent.keyboard("{Escape}");
    expect(field).not.toHaveAttribute("data-expanded", "true");
  });

  it("the last option is disabled and cannot be removed", async () => {
    render(<Harness discovered={[]} enabled={["refined-gold"]} />);
    expect(screen.getByText(APPEARANCE_COPY.floorHelper)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("textbox", { name: "Themes to include" }));
    const option = await screen.findByRole("option", {
      name: "Refined Gold",
      hidden: true
    });
    expect(option).toHaveAttribute("data-combobox-disabled", "true");
    await userEvent.click(option);
    expect(
      screen.getByRole("option", { name: "Refined Gold", hidden: true })
    ).toHaveAttribute("aria-selected", "true");
  });

  it("Backspace cannot remove the last option either", async () => {
    render(<Harness discovered={[]} enabled={["refined-gold"]} />);
    const field = screen.getByRole("textbox", { name: "Themes to include" });
    field.focus();
    await userEvent.keyboard("{Backspace}");
    expect(document.querySelectorAll(".mantine-MultiSelect-pill")).toHaveLength(1);
    expect(screen.getByText(APPEARANCE_COPY.floorHelper)).toBeInTheDocument();
  });

  it("keeps a placeholder so the field stays in the tab order", () => {
    render(<Harness discovered={[]} />);
    const field = screen.getByRole("textbox", { name: "Themes to include" });
    expect(field).not.toHaveAttribute("type", "hidden");
  });
});
