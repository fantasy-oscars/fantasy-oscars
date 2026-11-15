import { cleanup, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { MantineProvider } from "@ui";
import { ParticipantStrip } from "@/features/draft/ui/ParticipantStrip";

afterEach(cleanup);

const names = ["a", "b", "c", "d", "e", "f", "g", "h"];

describe("ParticipantStrip overflow chips", () => {
  it("names the hidden participants and stays focusable", () => {
    render(
      <MantineProvider>
        <ParticipantStrip
          containerRef={createRef<HTMLDivElement>()}
          capacity={4}
          start={3}
          end={6}
          activeIndex={4}
          direction={null}
          participants={names.map((label, i) => ({
            seatNumber: i + 1,
            label,
            active: i === 4,
            avatarKey: "fox"
          }))}
        />
      </MantineProvider>
    );
    const head = screen.getByLabelText("3 more: a, b, c");
    const tail = screen.getByLabelText("2 more: g, h");
    expect(head.getAttribute("tabindex")).toBe("0");
    expect(tail.getAttribute("tabindex")).toBe("0");
  });
});
