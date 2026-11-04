import { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { MantineProvider } from "@ui";
import { afterEach, describe, expect, it } from "vitest";
import { ShellHeader } from "@/app/chrome/ui/ShellHeader";
import { ShellNavDrawer } from "@/app/chrome/ui/ShellNavDrawer";
import { ShellPrimaryNav } from "@/app/chrome/ui/ShellPrimaryNav";

const USER = { sub: "1", username: "alice", is_admin: false, avatar_key: null };

function Harness(props: {
  navMode: "inline" | "drawer";
  inviteCount?: number;
  signedIn?: boolean;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <MantineProvider>
      <MemoryRouter>
        <ShellHeader
          navMode={props.navMode}
          rowRef={{ current: null }}
          navDrawerOpen={open}
          onOpenNavDrawer={() => setOpen(true)}
          user={props.signedIn === false ? null : USER}
          loading={props.loading ?? false}
          logout={() => Promise.resolve()}
          inviteCount={props.inviteCount ?? 0}
          userMenuOpen={false}
          setUserMenuOpen={() => undefined}
          colorScheme="light"
          setColorScheme={() => undefined}
          themeToggleIcon="x"
        />
        <ShellNavDrawer
          opened={open}
          onClose={() => setOpen(false)}
          primaryLinks={[{ to: "/", label: "Home" }]}
          user={props.signedIn === false ? null : { sub: "1" }}
          onLogout={() => Promise.resolve()}
        />
      </MemoryRouter>
    </MantineProvider>
  );
}

describe("shell header controls", () => {
  afterEach(cleanup);

  it("names the invites link by its count, capped at 9+", () => {
    const { rerender } = render(<Harness navMode="inline" inviteCount={0} />);
    expect(screen.getByRole("link", { name: "Invites" })).toHaveAttribute(
      "href",
      "/invites"
    );
    rerender(<Harness navMode="inline" inviteCount={3} />);
    expect(screen.getByRole("link", { name: "Invites, 3 pending" })).toBeInTheDocument();
    rerender(<Harness navMode="inline" inviteCount={12} />);
    expect(screen.getByRole("link", { name: "Invites, 9+ pending" })).toBeInTheDocument();
  });

  it("shows the account trigger inline and the full username as its title", () => {
    render(<Harness navMode="inline" />);
    const trigger = screen.getByRole("button", { name: /account menu$/i });
    expect(trigger).toHaveAttribute("title", "alice");
    expect(trigger).toHaveTextContent("alice");
  });

  it("offers both entry points when signed out, or Checking… while the session loads", () => {
    const { rerender } = render(<Harness navMode="inline" signedIn={false} />);
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute(
      "href",
      "/register"
    );
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute(
      "href",
      "/login"
    );
    rerender(<Harness navMode="inline" signedIn={false} loading />);
    expect(screen.getByText("Checking…")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Log in" })).not.toBeInTheDocument();
  });

  it("opens the drawer from the navigation button and returns focus to it on close", async () => {
    render(<Harness navMode="drawer" />);
    const opener = screen.getByRole("button", { name: "Open navigation" });
    expect(opener).toHaveAttribute("aria-expanded", "false");
    expect(opener).toHaveAttribute("aria-controls", "primary-nav-drawer-body");

    await userEvent.click(opener);
    await waitFor(() => expect(opener).toHaveAttribute("aria-expanded", "true"));
    expect(await screen.findByRole("dialog", { name: "Menu" })).toBeInTheDocument();
    expect(document.getElementById("primary-nav-drawer-body")).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Close navigation" }));
    await waitFor(() => expect(opener).toHaveAttribute("aria-expanded", "false"));
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("gives the drawer neutral Log out and account links when signed in", async () => {
    render(<Harness navMode="drawer" />);
    await userEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(await screen.findByRole("link", { name: "Account" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Log out/ })).toBeInTheDocument();
  });
});

describe("primary nav focus", () => {
  afterEach(cleanup);

  function renderNav(navMode: "inline" | "drawer") {
    render(
      <MantineProvider>
        <MemoryRouter>
          <ShellPrimaryNav
            navMode={navMode}
            navLinksRef={{ current: null }}
            links={[
              { to: "/a", label: "A" },
              { to: "/b", label: "B" }
            ]}
          />
        </MemoryRouter>
      </MantineProvider>
    );
    return document.querySelector("nav[aria-label=Primary]") as HTMLElement;
  }

  it("is inert and aria-hidden together while collapsed", () => {
    const nav = renderNav("drawer");
    expect(nav).toHaveAttribute("inert");
    expect(nav).toHaveAttribute("aria-hidden", "true");
    expect(nav.classList.contains("is-collapsed")).toBe(true);
  });

  it("is reachable when inline", () => {
    const nav = renderNav("inline");
    expect(nav).not.toHaveAttribute("inert");
    expect(nav).not.toHaveAttribute("aria-hidden");
    expect(screen.getByRole("link", { name: "A" })).toBeInTheDocument();
  });
});
