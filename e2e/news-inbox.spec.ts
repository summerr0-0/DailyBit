import { test, expect } from "@playwright/test";
import { Pool } from "pg";

// News inbox (spec: news-curation R9.2–R9.4, R0.2, R10.1).
// CI 격리 DB에 NEWS 초안을 직접 넣고, 오너로 /scrap에서 확인 → 발행 → 피드에 링크 있는 Bit가 뜨는지 본다.
// Playwright는 Prisma 생성 클라이언트(ESM)를 불러오지 못하므로 pg로 직접 SQL을 쓴다.

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const STAMP = Date.now();
const URL = `https://news.example/e2e-${STAMP}`;
const HEADLINE = `E2E headline ${STAMP}`;
const FEED_ID = `e2e_feed_${STAMP}`;
const DRAFT_ID = `e2e_draft_${STAMP}`;

test.beforeAll(async () => {
  await pool.query(
    `INSERT INTO users (id, email, nickname, "createdAt", "updatedAt")
     VALUES ($1, 'dev@dailybit.dev', 'devuser', now(), now()) ON CONFLICT (email) DO NOTHING`,
    [`e2e_user_${STAMP}`],
  );
  const { rows } = await pool.query(`SELECT id FROM users WHERE email = 'dev@dailybit.dev'`);
  const authorId = rows[0].id as string;

  await pool.query(
    `INSERT INTO feed_items (id, url, "urlNormalized", "sourceId", title, "publishedAt", score, status, "updatedAt")
     VALUES ($1, $2, $2, 'krebs', 'E2E source article', now(), 8, 'DRAFTED'::"FeedItemStatus", now())`,
    [FEED_ID, URL],
  );
  await pool.query(
    `INSERT INTO scrap_drafts (id, kind, "sourceType", "sourceUrl", "sourceTitle", "sourceLabel", "rawExtract",
       segments, warnings, "feedItemId", "authorId", "updatedAt")
     VALUES ($1, 'NEWS'::"DraftKind", 'URL'::"SourceType", $2, 'E2E source article', 'Krebs on Security', 'body',
       $3::jsonb, ARRAY['number_not_in_source:40'], $4, $5, now())`,
    [DRAFT_ID, URL, JSON.stringify([`${HEADLINE}\n- Fact one.\n- Fact two.\n\n${URL}\n#security`]), FEED_ID, authorId],
  );
});

test.afterAll(async () => {
  await pool.query(`DELETE FROM scrap_drafts WHERE id = $1`, [DRAFT_ID]);
  await pool.query(`DELETE FROM feed_items WHERE id = $1`, [FEED_ID]);
  await pool.end();
});

test("visitor sees no drafts on /scrap", async ({ page }) => {
  await page.goto("/scrap");
  await expect(page.getByText("News inbox")).toHaveCount(0);
  await expect(page.getByText(HEADLINE)).toHaveCount(0);
});

test("owner reviews a news draft in the inbox and publishes it with a clickable source link", async ({ page }) => {
  // 실제 로그인 API로 오너 쿠키를 받는다 (쿠키 형식에 의존하지 않음). CI e2e 잡이 ADMIN_PASSPHRASE를 준다.
  const login = await page.request.post("/api/auth/login", { data: { passphrase: process.env.ADMIN_PASSPHRASE } });
  expect(login.ok()).toBe(true);
  await page.goto("/scrap");

  const inbox = page.locator("section", { has: page.getByRole("heading", { name: /News inbox/ }) });
  await expect(inbox).toBeVisible();
  const meta = inbox.getByTestId("news-meta").filter({ hasText: "Krebs on Security" }).first();
  await expect(meta).toContainText("expires in");
  await expect(meta).toContainText("number_not_in_source:40");

  const card = inbox.locator("div", { has: page.locator(`textarea:has-text("${HEADLINE}")`) }).last();
  await card.getByRole("button", { name: "Publish" }).click();
  await expect(page.locator("textarea", { hasText: HEADLINE })).toHaveCount(0);

  await page.goto("/");
  const bit = page.locator("article", { hasText: HEADLINE });
  await expect(bit).toBeVisible();
  const link = bit.getByRole("link", { name: URL });
  await expect(link).toHaveAttribute("href", URL);
  await expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
});
