import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, renderHook } from "@testing-library/react";
import { screen } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@ui";
import { CategoryCard } from "@/features/draft/ui/CategoryCard";
import { useEscapeClearsSelection } from "@/features/draft/screens/useEscapeClearsSelection";

afterEach(cleanup);

describe("useEscapeClearsSelection", () => {
  it("clears the selection on Escape anywhere while a nominee is selected", async () => {
    const user = userEvent.setup();
    const clear = vi.fn();
    renderHook(() => useEscapeClearsSelection(7, clear));
    await user.keyboard("{Escape}");
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("ignores Escape when nothing is selected or another key is pressed", async () => {
    const user = userEvent.setup();
    const clear = vi.fn();
    const { rerender } = renderHook(
      ({ id }: { id: number | null }) => useEscapeClearsSelection(id, clear),
      { initialProps: { id: null as number | null } }
    );
    await user.keyboard("{Escape}");
    rerender({ id: 7 });
    await user.keyboard("a");
    expect(clear).not.toHaveBeenCalled();
  });
});

describe("armed nominee card", () => {
  it("lets the mouse reach the confirm button", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <MantineProvider>
        <CategoryCard
          categoryId="c1"
          title="Best Picture"
          icon="e4eb"
          iconVariant="default"
          unitKind="FILM"
          weightText={null}
          nominees={[
            {
              id: "1",
              label: "Nominee One",
              muted: false,
              selected: true,
              winner: false,
              posterUrl: null,
              filmTitle: "Nominee One",
              filmYear: 2035,
              contributors: [],
              songTitle: null,
              performerName: null,
              performerCharacter: null,
              performerProfileUrl: null,
              performerProfilePath: null
            }
          ]}
          canDraftAction
          isKeyboardMode={false}
          setKeyboardMode={() => {}}
          onNomineeClick={() => {}}
          onNomineeDoubleClick={onConfirm}
        />
      </MantineProvider>
    );
    // user-event refuses to click an element whose computed pointer-events is none.
    await user.click(await screen.findByRole("button", { name: "Confirm draft pick" }));
    expect(onConfirm).toHaveBeenCalledWith(1);
  });
});
