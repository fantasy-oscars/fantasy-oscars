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

test("an admin builds a Series and sees the association from the ceremony", async ({
  page
}) => {
  const suffix = Date.now().toString(36);
  const seriesName = `E2E Series ${suffix}`;
  await signInAsAdmin(page);

  // Create the Series; it starts with five events.
  await page.goto("/admin/series");
  const createForm = page.getByRole("form", { name: "New Series" });
  await createForm.getByLabel("Name").fill(seriesName);
  await createForm.getByLabel("Code").fill(`e2e-${suffix}`);
  await createForm.getByRole("button", { name: "Create Series" }).click();
  await expect(page.getByRole("heading", { level: 2, name: seriesName })).toBeVisible();

  // Associate the seeded ceremony with the Oscars event.
  const addForm = page.getByRole("form", { name: "Add a ceremony" });
  await choose(page, addForm, "Ceremony", CEREMONY_NAME);
  await choose(page, addForm, "Event", "Academy Awards");
  await addForm.getByRole("button", { name: "Add ceremony" }).click();
  const ceremonies = page.getByRole("region", { name: "Ceremonies" });
  await expect(ceremonies.getByRole("link", { name: CEREMONY_NAME })).toBeVisible();

  // Map one of its categories to a canonical category.
  const mappings = page.getByRole("region", { name: "Category mappings" });
  await choose(page, mappings, "Best Picture", "Best Picture");
  await expect(mappings.getByRole("textbox", { name: "Best Picture" })).toHaveValue(
    "Best Picture"
  );

  // Activation does not wait for dates; it names the ceremony that lacks them.
  await page.getByRole("button", { name: "Activate Series" }).click();
  await expect(
    page.getByText("Series activated. These ceremonies still need dates:")
  ).toBeVisible();
  await expect(
    page.getByText(`${CEREMONY_NAME}: nominations date, results date`)
  ).toBeVisible();

  // The ceremony admin reads the same association.
  await ceremonies.getByRole("link", { name: CEREMONY_NAME }).click();
  const seriesPanel = page.getByRole("region", { name: "Series", exact: true });
  await expect(seriesPanel.getByRole("link", { name: seriesName })).toBeVisible();
  await expect(seriesPanel.getByText("Academy Awards · ACTIVE")).toBeVisible();
});
