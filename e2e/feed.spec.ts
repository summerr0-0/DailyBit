import { test, expect } from "@playwright/test";

test.describe("피드", () => {
  test("홈 피드가 로딩된다", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/DailyBit/);
  });

  test("헤더에 DailyBit 타이틀이 보인다", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "DailyBit" })).toBeVisible();
  });

  test("피드에 Bit 목록이 표시된다", async ({ page }) => {
    await page.goto("/");
    const bits = page.locator("article");
    await expect(bits.first()).toBeVisible();
  });

  test("Bit에 작성자 닉네임이 표시된다", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("devuser").first()).toBeVisible();
  });

  test("Bit에 태그가 # 접두사와 함께 표시된다", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("#dailybit", { exact: true })).toBeVisible();
  });
});
