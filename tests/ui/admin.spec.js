import { test, expect } from "@playwright/test";

test("admin page renders and drive sync is disabled in local dev", async ({ page }) => {
  await page.goto("/admin");

  await expect(page.getByRole("heading", { name: "Gemini model" })).toBeVisible();

  const syncButton = page.getByRole("button", { name: "Run sync" });
  await expect(syncButton).toBeDisabled();
  await expect(page.locator(".footer-note", { hasText: "Drive sync is disabled" })).toBeVisible();

  await expect(page.locator("main")).toHaveScreenshot("admin-page.png", {
    maxDiffPixelRatio: 0.02
  });
});
