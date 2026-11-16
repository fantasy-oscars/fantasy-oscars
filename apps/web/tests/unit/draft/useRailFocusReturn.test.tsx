import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useRailFocusReturn } from "@/features/draft/ui/useRailFocusReturn";

function Rail() {
  const [open, setOpen] = useState(true);
  const { toggleRef, closeRef, close, noteExpand } = useRailFocusReturn(open, setOpen);
  return open ? (
    <button key="close" type="button" ref={closeRef} onClick={close}>
      Collapse
    </button>
  ) : (
    <button
      key="toggle"
      type="button"
      ref={toggleRef}
      onClick={() => {
        noteExpand();
        setOpen(true);
      }}
    >
      Expand
    </button>
  );
}

afterEach(cleanup);

describe("useRailFocusReturn", () => {
  it("returns focus to the toggle when the rail closes from its button", () => {
    render(<Rail />);
    screen.getByRole("button", { name: "Collapse" }).focus();
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    expect(screen.getByRole("button", { name: "Expand" })).toHaveFocus();
  });

  it("moves focus to the close button when the rail expands from its toggle", () => {
    render(<Rail />);
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    screen.getByRole("button", { name: "Expand" }).focus();
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByRole("button", { name: "Collapse" })).toHaveFocus();
  });

  it("does not take focus when the rail opens without the toggle", () => {
    function Opener() {
      const [open, setOpen] = useState(false);
      const { closeRef, close } = useRailFocusReturn(open, setOpen);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open elsewhere
          </button>
          {open ? (
            <button type="button" ref={closeRef} onClick={close}>
              Collapse
            </button>
          ) : null}
        </>
      );
    }
    render(<Opener />);
    fireEvent.click(screen.getByRole("button", { name: "Open elsewhere" }));
    expect(screen.getByRole("button", { name: "Collapse" })).not.toHaveFocus();
  });
});
