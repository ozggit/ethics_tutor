import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const LIVE = process.env.E2E_LOCAL === "1";

test.skip(!LIVE, "Set E2E_LOCAL=1 to run against localhost:3000");

test("live: weather question is refused (no repeated prior answer)", async ({ page }) => {
  await page.goto(`${BASE_URL}/`);

  const input = page.locator("textarea.chat-input");
  await input.fill("מה מזג האוויר היום?");
  await input.press("Enter");

  const assistant = page.locator(".message-assistant").last();
  await expect(assistant.locator(".message-bubble")).toBeVisible();
  await expect(assistant.locator(".message-text")).toBeVisible({ timeout: 20_000 });

  const text = await assistant.locator(".message-text").innerText();
  expect(text).toMatch(/מזג\s*האוויר/);
  expect(text).toMatch(/לא\s+יכול/);

  // Helpful sanity check: the refusal should not be tagged as grounded.
  expect(text).not.toMatch(/מבוסס\s+על\s+חומרי\s+הקורס/);

  // Not grounded (no File Search retrieval for weather).
  await expect(assistant.locator(".grounding-pill")).toHaveCount(0);
  await expect(page.locator("button.secondary")).toHaveCount(0);

  await page.locator(".chat-messages").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.screenshot({ path: "playwright-artifacts/weather-refusal.png", fullPage: true });
});
