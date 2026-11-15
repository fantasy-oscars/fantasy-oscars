import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MantineProvider } from "@ui";
import { DraftLiveRegion } from "@/features/draft/ui/DraftLiveRegion";
import type { DraftConnectionState } from "@/decisions/draft/connection";

function regions() {
  return screen.getAllByRole("status").map((el) => el.textContent);
}

afterEach(cleanup);

function renderAt(state: DraftConnectionState) {
  const view = render(
    <MantineProvider>
      <DraftLiveRegion message="avery is picking." connectionState={state} />
    </MantineProvider>
  );
  const set = (next: DraftConnectionState) =>
    view.rerender(
      <MantineProvider>
        <DraftLiveRegion message="avery is picking." connectionState={next} />
      </MantineProvider>
    );
  return set;
}

describe("DraftLiveRegion reconnection", () => {
  it("says nothing on the first connection", () => {
    const set = renderAt("connecting");
    set("connected");
    expect(regions()).toEqual(["avery is picking.", ""]);
  });

  it("announces Reconnected once when the socket recovers after a loss", () => {
    const set = renderAt("connected");
    set("reconnecting");
    expect(regions()[1]).toBe("");
    set("connected");
    expect(regions()).toEqual(["avery is picking.", "Reconnected"]);
  });

  it("also announces after a final disconnect that recovers", () => {
    const set = renderAt("disconnected");
    set("connected");
    expect(regions()[1]).toBe("Reconnected");
  });

  it("clears the notice when the connection is lost again", () => {
    const set = renderAt("reconnecting");
    set("connected");
    set("reconnecting");
    expect(regions()[1]).toBe("");
  });
});
