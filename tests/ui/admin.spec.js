import { test, expect } from "@playwright/test";

test("admin page renders and drive sync is disabled in local dev", async ({ page }) => {
  await page.goto("/admin");

  await expect(page.getByRole("heading", { name: "ניהול והסתכלות מערכת" })).toBeVisible();

  const syncButton = page.getByRole("button", { name: "הפעל סנכרון" });
  await expect(syncButton).toBeDisabled();
  await expect(page.locator(".footer-note", { hasText: "סנכרון Drive מושבת" })).toBeVisible();

  await expect(page.locator("main")).toHaveScreenshot("admin-page.png", {
    maxDiffPixelRatio: 0.02
  });
});
