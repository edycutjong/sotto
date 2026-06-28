import { test, expect } from "@playwright/test";

test.describe("Sotto Layout Responsiveness Checks", () => {
  test("should load without horizontal overflow on mobile viewports", async ({ page }) => {
    // Set viewport to a small mobile screen size
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    
    // Check that header logo and title are readable
    const brandName = page.locator("span").filter({ hasText: "SOTTO" }).first();
    await expect(brandName).toBeVisible();
  });

  test("should layout components correctly on desktop viewports", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    
    // Check main panels are visible
    await expect(page.getByText("Active Escrow Room")).toBeVisible();
    await expect(page.getByText("PROVER LOG TERMINAL")).toBeVisible();
    await expect(page.getByText("SUPABASE DATABASE LOGS")).toBeVisible();
  });
});
