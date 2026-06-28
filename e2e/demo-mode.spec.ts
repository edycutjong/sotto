import { test, expect } from "@playwright/test";

test.describe("Sotto Smoke Test - Demo Mode", () => {
  test("should load the landing page and have correct title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Sotto — Sealed-Bid Procurement/);
  });

  test("should render the console dashboard correctly", async ({ page }) => {
    await page.goto("/");
    const heading = page.locator("h1");
    await expect(heading).toContainText("Procurement Auction #101");
  });
});
