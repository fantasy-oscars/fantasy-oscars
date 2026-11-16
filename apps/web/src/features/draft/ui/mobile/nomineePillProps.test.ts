import { describe, expect, it, vi } from "vitest";
import { nomineePillProps } from "./nomineePillProps";

describe("nomineePillProps", () => {
  it("returns no props without a nomination", () => {
    expect(nomineePillProps(null, vi.fn())).toEqual({});
    expect(nomineePillProps(undefined, vi.fn())).toEqual({});
  });

  it("opens the nominee on click", () => {
    const onOpen = vi.fn();
    nomineePillProps(7, onOpen).onClick?.();
    expect(onOpen).toHaveBeenCalledWith(7);
  });

  it("opens on Enter and Space but not other keys", () => {
    const onOpen = vi.fn();
    const props = nomineePillProps(7, onOpen);
    const key = (k: string) =>
      props.onKeyDown?.({ key: k, preventDefault: vi.fn() } as never);
    key("Enter");
    key(" ");
    key("a");
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});
