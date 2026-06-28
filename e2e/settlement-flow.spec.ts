import { test, expect } from "@playwright/test";

test.describe("Sotto Sealed-Bid Settlement Flow E2E", () => {
  test("should allow navigating to submission tab and registering a new bid commitment", async ({
    page,
  }) => {
    await page.goto("/");

    // Switch to submit bid tab
    const submitTab = page.getByRole("button", {
      name: "Submit Bid Commitment",
    });
    await expect(submitTab).toBeVisible();
    await submitTab.click();

    // Fill the bid form
    await page.getByPlaceholder("GS444").fill("GS555");

    const bidAmountInput = page.locator('input[type="number"]');
    await bidAmountInput.fill("700000");

    // Click submit
    const submitButton = page.getByRole("button", {
      name: "Generate Hash & Submit Bid",
    });
    await submitButton.click();

    // Switch back to console view
    const overviewTab = page.getByRole("button", { name: "Auction Console" });
    await overviewTab.click();

    // Check that new bidder GS555 is registered
    const bidderText = page.getByText("GS555", { exact: true }).first();
    await expect(bidderText).toBeVisible();
  });
});
