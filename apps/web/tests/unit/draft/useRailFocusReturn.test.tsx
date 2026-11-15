import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useRailFocusReturn } from "@/features/draft/ui/useRailFocusReturn";

function Rail() {
  const [open, setOpen] = useState(true);
  const { toggleRef, close } = useRailFocusReturn(open, setOpen);
  return open ? (
    <button key="close" type="button" onClick={close}>
      Collapse
    </button>
  ) : (
    <button key="toggle" type="button" ref={toggleRef} onClick={() => setOpen(true)}>
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

  it("does not take focus when the rail opens", () => {
    render(<Rail />);
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByRole("button", { name: "Collapse" })).not.toHaveFocus();
  });
});
