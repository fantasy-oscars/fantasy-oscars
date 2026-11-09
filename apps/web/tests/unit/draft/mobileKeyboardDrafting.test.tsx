import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, renderHook, act } from "@testing-library/react";
import { screen } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@ui";
import { CategoryCard } from "@/features/draft/ui/CategoryCard";
import { useCategoryKeyboardFocus } from "@/features/draft/screens/mobile/useCategoryKeyboardFocus";

afterEach(cleanup);

const nominee = (id: string, label: string) => ({
  id,
  label,
  muted: false,
  selected: false,
  winner: false,
  posterUrl: null,
  filmTitle: label,
  filmYear: 2035,
  contributors: [],
  songTitle: null,
  performerName: null,
  performerCharacter: null,
  performerProfileUrl: null,
  performerProfilePath: null
});

describe("useCategoryKeyboardFocus", () => {
  it("holds the entered category and one stable first-pill ref per category", () => {
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => useCategoryKeyboardFocus(ids),
      { initialProps: { ids: ["a", "b"] } }
    );
    expect(result.current.keyboardCategoryId).toBeNull();
    const refA = result.current.firstPillRefByCategoryId.a;
    expect(refA).toBeDefined();
    act(() => result.current.setKeyboardCategoryId("b"));
    expect(result.current.keyboardCategoryId).toBe("b");
    rerender({ ids: ["a", "b", "c"] });
    expect(result.current.firstPillRefByCategoryId.a).toBe(refA);
    expect(result.current.firstPillRefByCategoryId.c).toBeDefined();
  });
});

describe("phone category card keyboard flow", () => {
  function Harness(props: { onOpen: (id: number) => void }) {
    const kb = useCategoryKeyboardFocus(["c1"]);
    return (
      <MantineProvider>
        <CategoryCard
          categoryId="c1"
          title="Best Picture"
          icon="e4eb"
          iconVariant="default"
          unitKind="FILM"
          tooltipsEnabled={false}
          weightText={null}
          nominees={[nominee("1", "One"), nominee("2", "Two")]}
          firstPillRef={kb.firstPillRefByCategoryId.c1 ?? null}
          canDraftAction
          isKeyboardMode={kb.keyboardCategoryId === "c1"}
          setKeyboardMode={kb.setKeyboardCategoryId}
          onNomineeClick={props.onOpen}
          onNomineeDoubleClick={() => {}}
        />
      </MantineProvider>
    );
  }

  it("Enter on the title row focuses the first pill; Enter on a pill opens it", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<Harness onOpen={onOpen} />);
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Category: Best Picture" })
    );
    await user.keyboard("{Enter}");
    const first = screen.getByRole("button", { name: "Best Picture: One" });
    expect(document.activeElement).toBe(first);
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Best Picture: Two" })
    );
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(first);
    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledWith(1, "One");
  });
});
