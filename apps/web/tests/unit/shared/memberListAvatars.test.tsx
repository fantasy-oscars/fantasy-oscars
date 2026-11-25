import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MantineProvider } from "@ui";
import { CircuitLeagueMembersSection } from "@/features/circuitLeagues/ui/CircuitLeagueMembersSection";
import { LeagueMembersSection } from "@/features/leagues/ui/LeagueMembersSection";
import { SeasonParticipantsColumn } from "@/features/seasons/ui/SeasonParticipantsColumn";

afterEach(cleanup);

function wrap(node: React.ReactNode) {
  return render(<MantineProvider>{node}</MantineProvider>);
}

/** Each list item draws a roomy PlayerName: the 26 px avatar before the name. */
function expectRoomyNames(list: HTMLElement, names: string[]) {
  const items = within(list).getAllByRole("listitem");
  expect(items).toHaveLength(names.length);
  items.forEach((item, i) => {
    const name = item.querySelector(".fo-playerName.is-roomy")!;
    expect(name.firstElementChild?.className).toContain("fo-animalAvatar");
    expect(name.textContent).toBe(names[i]);
  });
}

describe("member lists show each player's avatar", () => {
  it("full season Members", () => {
    wrap(
      <CircuitLeagueMembersSection
        members={[
          { user_id: 1, username: "cora", avatar_key: "owl", joined_at: "" },
          { user_id: 2, username: "emmy", avatar_key: null, joined_at: "" }
        ]}
        open={false}
        canManage={false}
        acting={false}
        lockStatus={null}
        onInitialize={() => {}}
      />
    );
    expectRoomyNames(screen.getByRole("list"), ["cora", "emmy"]);
  });

  it("single-ceremony season Participants, with the Commissioner pill", () => {
    wrap(
      <SeasonParticipantsColumn
        members={[
          { id: 1, user_id: 1, username: "cora", avatar_key: "owl", role: "OWNER" },
          { id: 2, user_id: 2, username: null, avatar_key: null, role: "MEMBER" }
        ]}
      />
    );
    const list = screen.getByRole("list");
    expectRoomyNames(list, ["cora", "User 2"]);
    expect(within(list).getByText("Commissioner")).toBeTruthy();
  });

  it("league Members", () => {
    wrap(
      <LeagueMembersSection
        members={[
          { id: 1, username: "cora", role: "OWNER", avatar_key: "owl" },
          { id: 2, username: "pia", role: "MEMBER" }
        ]}
      />
    );
    expectRoomyNames(screen.getByRole("list"), ["cora", "pia"]);
  });
});
