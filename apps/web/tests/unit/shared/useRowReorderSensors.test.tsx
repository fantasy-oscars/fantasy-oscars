import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DndContext } from "@dnd-kit/core";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { useRowReorderSensors } from "../../../src/shared/dnd/useRowReorderSensors";

afterEach(cleanup);

function Row(props: { id: number; onClick: () => void }) {
  const { listeners, setNodeRef } = useSortable({ id: props.id });
  return (
    <div ref={setNodeRef}>
      {/* As the season lists do: only the pointer and touch listeners, never onKeyDown. */}
      <button
        type="button"
        onClick={props.onClick}
        onPointerDown={listeners?.onPointerDown}
        onTouchStart={listeners?.onTouchStart}
      >
        {`Pill ${props.id}`}
      </button>
    </div>
  );
}

function List(props: { onDragStart: () => void; onClick: () => void }) {
  const sensors = useRowReorderSensors();
  return (
    <DndContext sensors={sensors} onDragStart={props.onDragStart}>
      <SortableContext items={[1, 2]}>
        <Row id={1} onClick={props.onClick} />
        <Row id={2} onClick={props.onClick} />
      </SortableContext>
    </DndContext>
  );
}

function pointer(type: string, x: number) {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX: x,
    clientY: 0,
    button: 0
  });
  Object.defineProperty(event, "isPrimary", { value: true });
  return event;
}

describe("useRowReorderSensors", () => {
  it("leaves Space and Enter to the pill: the keyboard never lifts the row", async () => {
    const onDragStart = vi.fn();
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<List onDragStart={onDragStart} onClick={onClick} />);

    screen.getByRole("button", { name: "Pill 1" }).focus();
    await user.keyboard(" ");
    await user.keyboard("{Enter}");

    expect(onDragStart).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("starts a pointer drag only after 6 px of travel", () => {
    const onDragStart = vi.fn();
    render(<List onDragStart={onDragStart} onClick={vi.fn()} />);
    const pill = screen.getByRole("button", { name: "Pill 1" });

    act(() => {
      pill.dispatchEvent(pointer("pointerdown", 0));
      document.dispatchEvent(pointer("pointermove", 4));
    });
    expect(onDragStart).not.toHaveBeenCalled();

    act(() => {
      document.dispatchEvent(pointer("pointermove", 8));
    });
    expect(onDragStart).toHaveBeenCalledTimes(1);
    fireEvent(document, pointer("pointerup", 8));
  });
});
