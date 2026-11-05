/** Accessible name for the theme toggle: names the mode it switches to. */
export function themeSwitchLabel(colorScheme: "light" | "dark" | string) {
  return colorScheme === "dark" ? "Switch to light mode" : "Switch to dark mode";
}
