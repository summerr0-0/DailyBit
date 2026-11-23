import { test, expect } from "@playwright/test";
import { Pool } from "pg";

// 캐나다 영주권 선발 화면 (spec: immigration-monitor R4) — 오너 전용, 방문자는 404.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const STAMP = Date.now();
const STREAM = `Accelerated Tech Pathway e2e ${STAMP}`;

test.beforeAll(async () => {
  await pool.query(
    `INSERT INTO immigration_draws (id, "dedupeKey", program, stream, "drawDate", "minScore", invitations, "invitationsText", "sourceUrl")
     VALUES ($1, $2, 'AAIP', $3, '2026-11-20', 58, 120, '120', 'https://www.alberta.ca/aaip-processing-information')`,
    [`e2e_draw_${STAMP}`, `e2e${STAMP}`.padEnd(64, "0"), STREAM],
  );
});

test.afterAll(async () => {
  await pool.query(`DELETE FROM immigration_draws WHERE id = $1`, [`e2e_draw_${STAMP}`]);
  await pool.end();
});

test("visitor gets 404 on /immigration", async ({ page }) => {
  expect((await page.goto("/immigration"))!.status()).toBe(404);
  await expect(page.getByText(STREAM)).toHaveCount(0);
});

test("owner sees stored draws, tech draws starred, and can filter to ★ only", async ({ page }) => {
  const login = await page.request.post("/api/auth/login", { data: { passphrase: process.env.ADMIN_PASSPHRASE } });
  expect(login.ok()).toBe(true);
  await page.goto("/immigration");
  const aaip = page.getByRole("region", { name: "Alberta AAIP" });
  await expect(aaip.getByRole("row", { name: new RegExp(`2026-11-20 ★ ${STREAM} 58 120`) })).toBeVisible();
  await page.getByRole("link", { name: "★ only" }).click();
  await expect(page).toHaveURL(/tech=1/);
  await expect(aaip.getByText(STREAM)).toBeVisible();
});
