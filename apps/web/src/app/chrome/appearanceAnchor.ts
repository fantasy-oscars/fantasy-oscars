/** Id of the Appearance heading on the account page (`${section id}-title`). */
const APPEARANCE_TITLE_ID = "appearance-title";

/** Scrolls the Appearance heading to the top and focuses it; false when it is not on the page. */
export function focusAppearanceHeading(): boolean {
  const heading = document.getElementById(APPEARANCE_TITLE_ID);
  if (!heading) return false;
  heading.scrollIntoView({ block: "start" });
  heading.focus({ preventScroll: true });
  return true;
}
