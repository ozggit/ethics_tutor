import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const LIVE = process.env.E2E_LIVE === "1";

test.skip(!LIVE, "Set E2E_LIVE=1 to run live pipeline E2E");

test("live pipeline: ask shows grounded badge (citations hidden)", async ({ page }) => {
  await page.goto(`${BASE_URL}/`);

  const input = page.locator("textarea.chat-input");
  await input.fill("מה ההבדל בין קאנט לרולס?");
  await input.press("Enter");

  const assistant1 = page.locator(".message-assistant").last();
  await expect(assistant1.locator(".message-bubble")).toBeVisible();

  // Wait for server meta to render grounding indicator.
  await expect(assistant1.locator(".grounding-pill")).toBeVisible({ timeout: 60_000 });

  // Capture what the real pipeline renders (even if assertions fail later).
  await page.locator(".chat-messages").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.screenshot({ path: "playwright-artifacts/live-pipeline-1.png", fullPage: true });

  // Sources button should not exist.
  await expect(page.locator("button.secondary")).toHaveCount(0);
});
