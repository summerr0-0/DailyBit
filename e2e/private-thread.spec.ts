import { test, expect } from "@playwright/test";
import { Pool } from "pg";

// 2026-11-22 비공개 노출 수정: 방문자는 비공개 Bit 본문도, 비공개 Bit만 있는 Thread의 제목도 볼 수 없다.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const STAMP = Date.now();
const SECRET_THREAD = `e2e_priv_t_${STAMP}`;
const MIXED_THREAD = `e2e_mixed_t_${STAMP}`;
const SECRET_TITLE = `Secret plan ${STAMP}`;
const MIXED_TITLE = `Mixed thread ${STAMP}`;
const SECRET_BIT = `Only for me ${STAMP}`;
const PUBLIC_BIT = `Hello world ${STAMP}`;
const MIXED_SECRET = `Hidden step ${STAMP}`;
let today = ""; // Bit를 넣은 시각의 KST 날짜 — DB에서 받아 자정 경계에서도 맞게 (Gemini #4)

test.beforeAll(async () => {
  await pool.query(
    `INSERT INTO users (id, email, nickname, "createdAt", "updatedAt")
     VALUES ($1, 'dev@dailybit.dev', 'devuser', now(), now()) ON CONFLICT (email) DO NOTHING`,
    [`e2e_u_${STAMP}`],
  );
  const { rows } = await pool.query(`SELECT id FROM users WHERE email = 'dev@dailybit.dev'`);
  const authorId = rows[0].id as string;
  await pool.query(
    `INSERT INTO threads (id, title, "authorId", "createdAt", "updatedAt") VALUES ($1, $2, $3, now(), now()), ($4, $5, $3, now(), now())`,
    [SECRET_THREAD, SECRET_TITLE, authorId, MIXED_THREAD, MIXED_TITLE],
  );
  await pool.query(
    `INSERT INTO bits (id, content, tags, private, "authorId", "threadId", "createdAt", "updatedAt") VALUES
     ($1, $2, ARRAY[]::text[], true, $3, $4, now(), now()),
     ($5, $6, ARRAY[]::text[], false, $3, $7, now(), now()),
     ($8, $9, ARRAY[]::text[], true, $3, $7, now(), now())`,
    [
      `e2e_pb1_${STAMP}`, SECRET_BIT, authorId, SECRET_THREAD,
      `e2e_pb2_${STAMP}`, PUBLIC_BIT, MIXED_THREAD,
      `e2e_pb3_${STAMP}`, MIXED_SECRET,
    ],
  );
  const kst = await pool.query(`SELECT to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS d FROM bits WHERE id = $1`, [`e2e_pb2_${STAMP}`]);
  today = kst.rows[0].d as string;
});

test.afterAll(async () => {
  await pool.query(`DELETE FROM bits WHERE "threadId" IN ($1, $2)`, [SECRET_THREAD, MIXED_THREAD]);
  await pool.query(`DELETE FROM threads WHERE id IN ($1, $2)`, [SECRET_THREAD, MIXED_THREAD]);
  await pool.end();
});

test("visitor: a thread with only private bits is hidden everywhere", async ({ page, request }) => {
  expect((await page.goto(`/threads/${SECRET_THREAD}`))!.status()).toBe(404);
  await expect(page.getByText(SECRET_BIT)).toHaveCount(0);

  await page.goto("/threads");
  await expect(page.getByText(MIXED_TITLE)).toBeVisible();
  await expect(page.getByText(SECRET_TITLE)).toHaveCount(0);

  const api = await (await request.get("/api/threads")).json();
  const titles = (api as { title: string; bitCount: number }[]).map((t) => t.title);
  expect(titles).not.toContain(SECRET_TITLE);
  expect((api as { title: string; bitCount: number }[]).find((t) => t.title === MIXED_TITLE)?.bitCount).toBe(1);
});

test("visitor: a mixed thread shows only its public bits", async ({ page, request }) => {
  await page.goto(`/threads/${MIXED_THREAD}`);
  await expect(page.getByText(PUBLIC_BIT)).toBeVisible();
  await expect(page.getByText(MIXED_SECRET)).toHaveCount(0);

  const byDate = JSON.stringify(await (await request.get(`/api/bits/by-date?date=${today}`)).json());
  expect(byDate).toContain(PUBLIC_BIT);
  expect(byDate).not.toContain(SECRET_BIT);
  expect(byDate).not.toContain(MIXED_SECRET);
});

test("owner still sees private threads and bits", async ({ page }) => {
  const login = await page.request.post("/api/auth/login", { data: { passphrase: process.env.ADMIN_PASSPHRASE } });
  expect(login.ok()).toBe(true);
  await page.goto(`/threads/${SECRET_THREAD}`);
  await expect(page.getByText(SECRET_BIT)).toBeVisible();
  await page.goto(`/threads/${MIXED_THREAD}`);
  await expect(page.getByText(PUBLIC_BIT)).toBeVisible();
  await expect(page.getByText(MIXED_SECRET)).toBeVisible();
  await page.goto("/threads");
  await expect(page.getByText(SECRET_TITLE)).toBeVisible();
  const api = (await (await page.request.get("/api/threads")).json()) as { title: string; bitCount: number }[];
  expect(api.find((t) => t.title === MIXED_TITLE)?.bitCount).toBe(2);
  const byDate = JSON.stringify(await (await page.request.get(`/api/bits/by-date?date=${today}`)).json());
  expect(byDate).toContain(SECRET_BIT);
});
