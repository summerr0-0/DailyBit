import { test, expect } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../src/generated/prisma/client";

// News inbox (spec: news-curation R9.2–R9.4, R0.2, R10.1).
// CI 격리 DB에 NEWS 초안을 직접 넣고, 오너로 /scrap에서 확인 → 발행 → 피드에 링크 있는 Bit가 뜨는지 본다.

const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })) });
const STAMP = Date.now();
const URL = `https://news.example/e2e-${STAMP}`;
const HEADLINE = `E2E headline ${STAMP}`;

test.beforeAll(async () => {
  const author = await prisma.user.upsert({
    where: { email: "dev@dailybit.dev" },
    update: {},
    create: { email: "dev@dailybit.dev", nickname: "devuser" },
  });
  const item = await prisma.feedItem.create({
    data: {
      url: URL,
      urlNormalized: URL,
      sourceId: "krebs",
      title: "E2E source article",
      publishedAt: new Date(),
      score: 8,
      status: "DRAFTED",
    },
  });
  await prisma.scrapDraft.create({
    data: {
      kind: "NEWS",
      sourceType: "URL",
      sourceUrl: URL,
      sourceTitle: "E2E source article",
      sourceLabel: "Krebs on Security",
      rawExtract: "body",
      segments: [`${HEADLINE}\n- Fact one.\n- Fact two.\n\n${URL}\n#security`],
      warnings: ["number_not_in_source:40"],
      feedItemId: item.id,
      authorId: author.id,
    },
  });
});

test.afterAll(async () => {
  await prisma.feedItem.deleteMany({ where: { urlNormalized: URL } });
  await prisma.$disconnect();
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
