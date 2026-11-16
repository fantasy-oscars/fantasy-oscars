import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MantineProvider } from "@ui";
import { AdminUsersSearchScreen } from "@/features/admin/screens/users/AdminUsersSearchScreen";
import type { AdminUserRow } from "@/orchestration/admin/users/orchestration";

afterEach(cleanup);

const USERS: AdminUserRow[] = [
  {
    id: 1,
    username: "avery",
    email: "avery@example.com",
    is_admin: false,
    admin_role: "NONE"
  },
  {
    id: 2,
    username: "blake",
    email: "blake@example.org",
    is_admin: true,
    admin_role: "OPERATOR"
  }
];

function renderScreen(results: AdminUserRow[]) {
  render(
    <MantineProvider>
      <AdminUsersSearchScreen
        query=""
        setQuery={() => undefined}
        searching={false}
        status={null}
        results={results}
        onSearch={() => undefined}
        updatingById={{}}
        onSetRole={() => undefined}
        onRemoveUser={() => undefined}
      />
    </MantineProvider>
  );
}

describe("admin users search", () => {
  it("labels the search field for usernames and emails", () => {
    renderScreen([]);
    const field = screen.getByRole("textbox", { name: "Username or email" });
    expect(field).toHaveAttribute("placeholder", "Username or email");
  });

  it("shows each result's email as a subtitle under the username", () => {
    renderScreen(USERS);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    USERS.forEach((user, i) => {
      const row = within(rows[i]);
      const name = row.getByText(user.username);
      const email = row.getByText(user.email);
      // Subtitle: the line straight after the username, in the same block.
      expect(name.nextElementSibling).toBe(email);
      expect(row.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    });
  });
});
