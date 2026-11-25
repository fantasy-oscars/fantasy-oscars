import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MantineProvider } from "@ui";
import { PlayerName } from "@/shared/PlayerName";

afterEach(cleanup);

function wrap(node: React.ReactNode) {
  return render(<MantineProvider>{node}</MantineProvider>);
}

describe("PlayerName", () => {
  it("draws the avatar before the name, hidden from screen readers", () => {
    const { container } = wrap(<PlayerName name="cora" avatarKey="owl" />);
    const root = container.querySelector(".fo-playerName")!;
    expect(root.className).toContain("is-dense");
    const avatar = root.firstElementChild!;
    expect(avatar.className).toContain("fo-animalAvatar");
    expect(avatar.getAttribute("aria-hidden")).toBe("true");
    expect(root.textContent).toBe("cora");
  });

  it("falls back to the default animal when the player has no avatar key", () => {
    const { container } = wrap(<PlayerName name="theo" avatarKey={null} />);
    const avatar = container.querySelector<HTMLElement>(".fo-animalAvatar")!;
    expect(avatar.style.getPropertyValue("--fo-animalAvatar-src")).toMatch(/^url\(/);
  });

  it("adds a visually hidden ', you' for the viewer and draws nothing visible", () => {
    const { container } = wrap(<PlayerName name="cora" avatarKey="owl" isViewer />);
    const text = screen.getByText("cora");
    expect(text.textContent).toBe("cora, you");
    expect(container.textContent).not.toContain("(you)");
    // The suffix is not part of the hover title.
    expect(text.getAttribute("title")).toBe("cora");
  });

  it("uses the 26 px avatar and body text in roomy lists, wrapping long names", () => {
    const { container } = wrap(
      <PlayerName
        name="averyverylongname"
        avatarKey="owl"
        density="roomy"
        wrap="anywhere"
      />
    );
    const root = container.querySelector(".fo-playerName")!;
    expect(root.className).toContain("is-roomy");
    const avatar = container.querySelector<HTMLElement>(".fo-animalAvatar")!;
    expect(avatar.style.getPropertyValue("--fo-animalAvatar-size")).toContain(
      "var(--fo-space-4)"
    );
    const text = screen.getByText("averyverylongname");
    expect(text.className).toContain("baseline-textBody");
    expect(text.className).toContain("baseline-wrapAnywhere");
    expect(text.getAttribute("title")).toBeNull();
  });

  it("keeps one line with an ellipsis by default, the full name in its title", () => {
    wrap(<PlayerName name="emmy" avatarKey="owl" />);
    const text = screen.getByText("emmy");
    expect(text.className).toContain("is-ellipsis");
    expect(text.getAttribute("title")).toBe("emmy");
  });

  it("takes a second line under the name and is never a tab stop", () => {
    const { container } = wrap(
      <PlayerName name="pia" avatarKey="owl" density="roomy" bold>
        <span>Nominations 2 pts</span>
      </PlayerName>
    );
    const root = container.querySelector(".fo-playerName")!;
    expect(root.className).toContain("has-subline");
    expect(root.textContent).toBe("piaNominations 2 pts");
    expect(container.querySelector("[tabindex], a, button")).toBeNull();
  });
});
