import { test, expect } from "@playwright/test";

// 사용자 요청 2026-11-22: 모바일 최적화. 폰 너비에서 페이지가 옆으로 밀리지 않고, 태그가 피드 위 한 줄로 온다.
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

for (const path of ["/", "/threads", "/garden", "/tags/ai"]) {
  test(`no horizontal page scroll at phone width: ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
}

test("home tag filter sits above the feed as a single row on phones", async ({ page }) => {
  await page.goto("/");
  // 피드와 태그는 서로 다른 Suspense — 둘 다 그려진 뒤에 비교한다
  await expect(page.getByText("Loading...")).toHaveCount(0);
  const tagCard = page.locator(".db-tag-card").first();
  await expect(tagCard).toBeVisible();
  const list = tagCard.locator(".db-tag-list");
  expect(await list.evaluate((el) => getComputedStyle(el).flexDirection)).toBe("row");
  // 빈 DB(CI)에서도 성립하도록 글 대신 피드 열(사이드바가 아닌 칸)과 비교한다
  const feedColumn = page.locator(".db-grid > :not(.db-side)").first();
  const [tagBox, feedBox] = [await tagCard.boundingBox(), await feedColumn.boundingBox()];
  expect(tagBox!.y).toBeLessThan(feedBox!.y);
});
