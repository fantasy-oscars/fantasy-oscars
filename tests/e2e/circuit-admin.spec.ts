import { test, expect, type Locator, type Page } from "@playwright/test";
import { ADMIN_PASSWORD, ADMIN_USERNAME, CEREMONY_NAME } from "./support/seed";

async function signInAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(ADMIN_USERNAME);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: ADMIN_USERNAME })).toBeVisible();
}

async function choose(page: Page, scope: Locator, label: string, option: string) {
  await scope.getByRole("textbox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("an admin builds a Circuit in the tabbed editor and sees it from the ceremony", async ({
  page
}) => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const circuitName = `E2E Circuit ${suffix}`;
  await signInAsAdmin(page);

  // Create the Circuit; it opens on the Categories tab, empty.
  await page.goto("/admin/circuits");
  const createForm = page.getByRole("form", { name: "New Circuit" });
  await createForm.getByLabel("Name").fill(circuitName);
  await createForm.getByLabel("Code").fill(`e2e-${suffix}`);
  await createForm.getByRole("button", { name: "Create Circuit" }).click();
  await expect(page.getByRole("heading", { level: 2, name: circuitName })).toBeVisible();
  const panel = page.getByRole("tabpanel");
  await expect(
    panel.getByText("No categories yet. Add one from a template.")
  ).toBeVisible();

  // Build a Circuit category from a template.
  await panel.getByRole("button", { name: "Add category" }).click();
  const addCategory = page.getByRole("dialog", { name: "Add a category" });
  await choose(page, addCategory, "Category template", "Best Picture");
  await addCategory.getByRole("button", { name: "Add category" }).click();
  await expect(
    panel.getByRole("list", { name: "Circuit categories" }).getByText("Best Picture")
  ).toBeVisible();

  // Add the seeded ceremony, ungrouped, then an empty named group.
  await page.getByRole("tab", { name: "Ceremonies" }).click();
  await expect(panel.getByText("No ceremonies yet.")).toBeVisible();
  await panel.getByRole("button", { name: "Add ceremony" }).click();
  const addCeremony = page.getByRole("dialog", { name: "Add a ceremony" });
  await choose(page, addCeremony, "Ceremony", CEREMONY_NAME);
  await addCeremony.getByRole("button", { name: "Add ceremony" }).click();
  await expect(panel.getByRole("link", { name: CEREMONY_NAME })).toBeVisible();

  await panel.getByRole("button", { name: "Add group" }).click();
  const addGroup = page.getByRole("dialog", { name: "Add a group" });
  await addGroup.getByLabel("Group name").fill("Guild Awards");
  await addGroup.getByRole("button", { name: "Add group" }).click();
  const group = panel.getByRole("listitem", { name: "Group: Guild Awards" });
  await expect(group.getByText("Group · 0 ceremonies")).toBeVisible();

  // Drag the ceremony into the group with the keyboard: lift with Space, move
  // over the group's header and then its body, and drop with Space.
  // The closed dialog hands focus back to Add group first.
  await expect(addGroup).toBeHidden();
  await expect(panel.getByRole("button", { name: "Add group" })).toBeFocused();
  const handle = panel.getByRole("button", { name: `Move ${CEREMONY_NAME}` });
  await handle.focus();
  await expect(handle).toBeFocused();
  // Each step waits for the screen reader announcement it causes.
  const announced = (text: string) => expect(page.getByText(text)).toBeAttached();
  await page.keyboard.press("Space");
  await announced(`${CEREMONY_NAME} is over ${CEREMONY_NAME}.`);
  // dnd-kit starts listening for the arrow keys in a zero-delay timer after the
  // lift; a timer queued now runs after it, so the next key is not lost.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
  await page.keyboard.press("ArrowDown");
  await announced(`${CEREMONY_NAME} is over the place of the group Guild Awards.`);
  await page.keyboard.press("ArrowDown");
  await announced(`${CEREMONY_NAME} is over the group Guild Awards.`);
  await page.keyboard.press("Space");
  await announced(`${CEREMONY_NAME} was dropped on the group Guild Awards.`);
  await expect(group.getByText("Group · 1 ceremony")).toBeVisible();
  await page.reload();
  await expect(
    page
      .getByRole("listitem", { name: "Group: Guild Awards" })
      .getByRole("link", { name: CEREMONY_NAME })
  ).toBeVisible();

  // The mapping modal pre-selects the template match; only the save writes it.
  // Many-to-one: a second category of the ceremony feeds the same one.
  await page.getByRole("button", { name: `Map categories for ${CEREMONY_NAME}` }).click();
  const mapping = page.getByRole("dialog", { name: `Map categories: ${CEREMONY_NAME}` });
  await expect(mapping.getByText("1 unsaved change.")).toBeVisible();
  await choose(page, mapping, "Best Picture", "Best Director");
  await expect(mapping.getByText("2 unsaved changes.")).toBeVisible();
  // Clicking outside the open multi-select closes its list.
  await mapping.getByText(/^Choose the ceremony categories/).click();
  await mapping.getByRole("button", { name: "Save mappings" }).click();
  await expect(mapping).toBeHidden();
  await page.getByRole("button", { name: `Map categories for ${CEREMONY_NAME}` }).click();
  await expect(mapping.getByText("All mappings are saved.")).toBeVisible();
  await mapping.getByRole("button", { name: "Cancel" }).click();

  // The Schedule tab is read-only and lists the ceremony date.
  await page.getByRole("tab", { name: "Schedule" }).click();
  await expect(
    page.getByRole("tabpanel").getByText(`${CEREMONY_NAME} · Ceremony`)
  ).toBeVisible();

  // Activation does not wait for dates; it names the date the ceremony lacks.
  await page.getByRole("button", { name: "Activate Circuit" }).click();
  await expect(
    page.getByText("Circuit activated. These ceremonies still need dates:")
  ).toBeVisible();
  await expect(page.getByText(`${CEREMONY_NAME}: nominations date`)).toBeVisible();

  // The ceremony admin shows the attachment, with the group's name.
  await page.goto("/admin/circuits");
  await page.getByRole("link", { name: circuitName }).click();
  await page.getByRole("tab", { name: "Ceremonies" }).click();
  await page.getByRole("link", { name: CEREMONY_NAME }).click();
  const circuitPanel = page.getByRole("region", { name: "Circuits", exact: true });
  const row = circuitPanel
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: circuitName }) });
  await expect(row.getByText("Guild Awards · ACTIVE")).toBeVisible();
});
