import { test, expect } from "@playwright/test";
import { Pool } from "pg";

// 사용자 요청 2026-11-20: 홈 피드엔 Thread 첫 Bit만, Thread 제목·Bit 수정, 굵게.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const STAMP = Date.now();
const THREAD = `e2e_thread_${STAMP}`;
const FIRST = `First step ${STAMP}`;
const SECOND = `Second step ${STAMP}`;

test.beforeAll(async () => {
  await pool.query(
    `INSERT INTO users (id, email, nickname, "createdAt", "updatedAt")
     VALUES ($1, 'dev@dailybit.dev', 'devuser', now(), now()) ON CONFLICT (email) DO NOTHING`,
    [`e2e_u_${STAMP}`],
  );
  const { rows } = await pool.query(`SELECT id FROM users WHERE email = 'dev@dailybit.dev'`);
  const authorId = rows[0].id as string;
  await pool.query(`INSERT INTO threads (id, title, "authorId", "createdAt", "updatedAt") VALUES ($1, $2, $3, now(), now())`, [
    THREAD,
    `E2E thread ${STAMP}`,
    authorId,
  ]);
  await pool.query(
    `INSERT INTO bits (id, content, tags, "authorId", "threadId", "createdAt", "updatedAt") VALUES
     ($1, $2, ARRAY[]::text[], $3, $4, now() - interval '1 minute', now()),
     ($5, $6, ARRAY[]::text[], $3, $4, now(), now())`,
    [`e2e_b1_${STAMP}`, `${FIRST} with **bold**`, authorId, THREAD, `e2e_b2_${STAMP}`, SECOND],
  );
});

test.afterAll(async () => {
  await pool.query(`DELETE FROM bits WHERE "threadId" = $1`, [THREAD]);
  await pool.query(`DELETE FROM threads WHERE id = $1`, [THREAD]);
  await pool.end();
});

test("home feed shows only the thread's first bit, with bold rendered", async ({ page }) => {
  await page.goto("/");
  const first = page.locator("article", { hasText: FIRST });
  await expect(first).toBeVisible();
  await expect(first.locator("strong", { hasText: "bold" })).toBeVisible();
  await expect(first.getByRole("link", { name: /E2E thread .* · 2 bits/ })).toBeVisible();
  await expect(page.locator("article", { hasText: SECOND })).toHaveCount(0);
});

test("visitor sees no edit controls on the thread page", async ({ page }) => {
  await page.goto(`/threads/${THREAD}`);
  await expect(page.getByText(SECOND)).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit thread title" })).toHaveCount(0);
});

test("owner edits the thread title and a bit", async ({ page }) => {
  const login = await page.request.post("/api/auth/login", { data: { passphrase: process.env.ADMIN_PASSPHRASE } });
  expect(login.ok()).toBe(true);
  await page.goto(`/threads/${THREAD}`);

  await page.getByRole("button", { name: "Edit thread title" }).click();
  await page.getByLabel("Thread title").fill(`Renamed ${STAMP}`);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: `Renamed ${STAMP}` })).toBeVisible();

  await page.getByRole("button", { name: "Edit this bit" }).nth(1).click();
  await page.getByLabel("Bit content").fill(`${SECOND} edited`);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(`${SECOND} edited`)).toBeVisible();
});
