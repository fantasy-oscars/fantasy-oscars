import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { useReorderSensors } from "../../../src/shared/dnd/useReorderSensors";

const ROW_HEIGHT = 40;

function Row(props: { id: number; index: number }) {
  const { attributes, listeners, setNodeRef } = useSortable({ id: props.id });
  const ref = (node: HTMLDivElement | null) => {
    if (node) {
      // jsdom has no layout: give each row a box so the keyboard can find its neighbour.
      node.getBoundingClientRect = () =>
        ({
          top: props.index * ROW_HEIGHT,
          bottom: (props.index + 1) * ROW_HEIGHT,
          left: 0,
          right: 200,
          width: 200,
          height: ROW_HEIGHT,
          x: 0,
          y: props.index * ROW_HEIGHT,
          toJSON: () => ({})
        }) as DOMRect;
    }
    setNodeRef(node);
  };
  return (
    <div ref={ref}>
      <button
        type="button"
        aria-label={`Reorder ${props.id}`}
        {...attributes}
        {...listeners}
      >
        {props.id}
      </button>
    </div>
  );
}

function List(props: { ids: number[]; onDragEnd: (event: DragEndEvent) => void }) {
  const sensors = useReorderSensors();
  return (
    <DndContext sensors={sensors} onDragEnd={props.onDragEnd}>
      <SortableContext items={props.ids}>
        {props.ids.map((id, index) => (
          <Row key={id} id={id} index={index} />
        ))}
      </SortableContext>
    </DndContext>
  );
}

describe("useReorderSensors", () => {
  it("reorders from the keyboard: Space lifts, arrow moves, Space drops", async () => {
    const onDragEnd = vi.fn();
    const user = userEvent.setup();
    render(<List ids={[1, 2, 3]} onDragEnd={onDragEnd} />);

    screen.getByRole("button", { name: "Reorder 1" }).focus();
    await user.keyboard(" ");
    await user.keyboard("{ArrowDown}");
    await user.keyboard(" ");

    expect(onDragEnd).toHaveBeenCalledTimes(1);
    const event = onDragEnd.mock.calls[0][0] as DragEndEvent;
    expect(event.active.id).toBe(1);
    expect(event.over?.id).toBe(2);
  });
});
