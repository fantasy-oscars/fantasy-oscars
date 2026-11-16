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

test("an admin builds a Circuit and sees the association from the ceremony", async ({
  page
}) => {
  const suffix = Date.now().toString(36);
  const circuitName = `E2E Circuit ${suffix}`;
  await signInAsAdmin(page);

  // Create the Circuit; it starts with no ceremonies, events or categories.
  await page.goto("/admin/circuits");
  const createForm = page.getByRole("form", { name: "New Circuit" });
  await createForm.getByLabel("Name").fill(circuitName);
  await createForm.getByLabel("Code").fill(`e2e-${suffix}`);
  await createForm.getByRole("button", { name: "Create Circuit" }).click();
  await expect(page.getByRole("heading", { level: 2, name: circuitName })).toBeVisible();
  const ceremonies = page.getByRole("region", { name: "Ceremonies" });
  await expect(ceremonies.getByText("No ceremonies yet.")).toBeVisible();
  const categories = page.getByRole("region", { name: "Categories" });
  await expect(
    categories.getByText("No categories yet. Add one from a template.")
  ).toBeVisible();

  // Build a Circuit category from a template.
  const addCategory = page.getByRole("form", { name: "Add a category" });
  await choose(page, addCategory, "Category template", "Best Picture");
  await addCategory.getByRole("button", { name: "Add category" }).click();
  await expect(categories.getByText("Best Picture", { exact: true })).toBeVisible();

  // Add the seeded ceremony without an event: it gets its own, named after it.
  const addForm = page.getByRole("form", { name: "Add a ceremony" });
  await choose(page, addForm, "Ceremony", CEREMONY_NAME);
  await addForm.getByRole("button", { name: "Add ceremony" }).click();
  const event = ceremonies.getByRole("group", { name: `Event: ${CEREMONY_NAME}` });
  await expect(event.getByRole("link", { name: CEREMONY_NAME })).toBeVisible();

  // The matching template pre-selects the mapping; only the save writes it.
  const mappings = page.getByRole("region", { name: "Category mappings" });
  await expect(mappings.getByRole("textbox", { name: "Best Picture" })).toHaveValue(
    "Best Picture"
  );
  await expect(mappings.getByText("1 unsaved change.")).toBeVisible();

  // Many-to-one: a second category of the same ceremony maps to the same one.
  await choose(page, mappings, "Best Director", "Best Picture");
  await expect(mappings.getByText("2 unsaved changes.")).toBeVisible();
  await mappings.getByRole("button", { name: "Save mappings" }).click();
  await expect(mappings.getByText("All mappings are saved.")).toBeVisible();
  await expect(
    mappings
      .getByRole("group", { name: "Mapped to each Circuit category" })
      .getByText(`${CEREMONY_NAME} · Best Picture; ${CEREMONY_NAME} · Best Director`)
  ).toBeVisible();

  // Activation does not wait for dates; it names the ceremony that lacks them.
  await page.getByRole("button", { name: "Activate Circuit" }).click();
  await expect(
    page.getByText("Circuit activated. These ceremonies still need dates:")
  ).toBeVisible();
  await expect(
    page.getByText(`${CEREMONY_NAME}: nominations date, results date`)
  ).toBeVisible();

  // The ceremony admin reads the same association.
  await event.getByRole("link", { name: CEREMONY_NAME }).click();
  const circuitPanel = page.getByRole("region", { name: "Circuits", exact: true });
  const row = circuitPanel
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: circuitName }) });
  await expect(row.getByText(`${CEREMONY_NAME} · ACTIVE`)).toBeVisible();
});
