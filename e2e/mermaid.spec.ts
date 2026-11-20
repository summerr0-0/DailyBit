import { test, expect } from "@playwright/test";
import { Pool } from "pg";

// 사용자 요청 2026-11-20: ```mermaid 블록을 도표로 그린다.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const STAMP = Date.now();
const BIT = `e2e_mmd_${STAMP}`;
const CONTENT = `Pipeline ${STAMP}\n\`\`\`mermaid\nflowchart LR\n  A[RSS feeds] --> B[Score]\n  B --> C[Inbox]\n\`\`\`\nbroken below\n\`\`\`mermaid\nnot a diagram ((\n\`\`\``;

test.beforeAll(async () => {
  await pool.query(
    `INSERT INTO users (id, email, nickname, "createdAt", "updatedAt")
     VALUES ($1, 'dev@dailybit.dev', 'devuser', now(), now()) ON CONFLICT (email) DO NOTHING`,
    [`e2e_u_${STAMP}`],
  );
  const { rows } = await pool.query(`SELECT id FROM users WHERE email = 'dev@dailybit.dev'`);
  await pool.query(
    `INSERT INTO bits (id, content, tags, "authorId", "createdAt", "updatedAt") VALUES ($1, $2, ARRAY[]::text[], $3, now(), now())`,
    [BIT, CONTENT, rows[0].id],
  );
});

test.afterAll(async () => {
  await pool.query(`DELETE FROM bits WHERE id = $1`, [BIT]);
  await pool.end();
});

test("renders a mermaid block as an SVG diagram and shows source for a broken one", async ({ page }) => {
  await page.goto("/");
  const card = page.locator("article", { hasText: `Pipeline ${STAMP}` });
  const diagram = card.getByTestId("mermaid-diagram");
  await expect(diagram.locator("svg")).toBeVisible({ timeout: 15_000 });
  await expect(diagram).toContainText("RSS feeds");
  await expect(card.getByText("Diagram could not be drawn — showing the source.")).toBeVisible();
  await expect(card.locator("code", { hasText: "not a diagram" })).toBeVisible();
  // 깨진 도표가 body에 mermaid 오류 SVG를 남기지 않는다 (Gemini mermaid #1)
  await expect(page.locator("body > [id^='dmmd-']")).toHaveCount(0);
});
