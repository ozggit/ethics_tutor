import { test, expect } from "@playwright/test";

test("chat strips inline cite markers, avoids duplicated answers, and shows grounding badge", async ({ page }) => {
  let askCalls = 0;
  await page.route("**/api/ask", async (route) => {
    askCalls += 1;
    const req = route.request();
    const body = req.postDataJSON?.() || {};
    const question = String(body.question || "");

    const baseAnswer =
      "משפט פתיחה קצר שמסביר את העיקר.\n\nכדי להמחיש זאת נשתמש בדוגמה מעולם העבודה:\n- נקודה 1\n- נקודה 2\n\nשאלת בדיקת הבנה קצרה בסוף.";
    // Simulate a buggy model output: duplicated answer + inline cite markers.
    const answer =
      question.includes("בדיקת")
        ? `${baseAnswer}\n\n${baseAnswer} [cite: 1, 2, 3]`
        : baseAnswer;

    const events = [];
    const chunkSize = 60;
    for (let i = 0; i < answer.length; i += chunkSize) {
      events.push(`data: ${JSON.stringify({ type: "chunk", value: answer.slice(i, i + chunkSize) })}`);
    }
      events.push(
        `data: ${JSON.stringify({
          type: "meta",
          groundingStatus: "grounded",
          citations: [],
          sessionId: "e2e"
        })}`
      );
    events.push("data: [DONE]");

    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform"
      },
      body: `${events.join("\n\n")}\n\n`
    });
  });

  await page.goto("/");

  const input = page.locator("textarea.chat-input");
  await input.fill("בדיקת UI");
  await input.press("Enter");

  expect(askCalls).toBe(1);

  const assistant1 = page.locator(".message-assistant").last();
  await expect(assistant1.locator(".message-bubble")).toBeVisible();
  await expect(assistant1.locator(".message-text")).toBeVisible();
  await expect(assistant1.locator(".grounding-pill")).toBeVisible();

  // 1) Ensure there is a paragraph break before "כדי להמחיש זאת".
  const assistantText = await assistant1.locator(".message-text").innerText();
  expect(assistantText).toMatch(/\.\s*\n+\s*כדי להמחיש זאת/);

  // Ensure no inline cite markers are rendered.
  expect(assistantText).not.toMatch(/\bcite\s*:/i);

  // Ensure the answer was not rendered twice.
  const occurrences = assistantText.split("משפט פתיחה קצר").length - 1;
  expect(occurrences).toBe(1);

  // Sources button should be removed (citations are intentionally hidden).
  await expect(page.locator("button.secondary")).toHaveCount(0);

  // Scroll to ensure the citations area is visible in the screenshot.
  await page.locator(".chat-messages").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });

  await expect(page.locator(".chat-messages")).toHaveScreenshot("chat-sources-flow.png", {
    maxDiffPixelRatio: 0.02
  });
});
