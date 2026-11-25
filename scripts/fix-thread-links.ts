/**
 * 이미 남은 Bit의 사이트 안 절대 링크(예전 테스트 주소 daily-bit.vercel.app 등)를 [[Thread 제목]]으로 바꾼다.
 * 기본은 미리보기(아무것도 안 바꿈). --apply일 때만 DB를 고친다.
 *
 *   pnpm tsx scripts/fix-thread-links.ts            # 바뀔 내용만 출력
 *   pnpm tsx scripts/fix-thread-links.ts --apply    # 실제로 고침
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { rewriteThreadLinks } from "@/lib/thread-link-fix";
import { getLinkTargets } from "@/lib/link-targets";
import { resolveLink } from "@/lib/wiki-links";

async function main() {
  const apply = process.argv.includes("--apply");
  const bits = await prisma.bit.findMany({
    where: { OR: [{ content: { contains: "daily-bit.vercel.app/threads/" } }, { content: { contains: "irin-j.com/threads/" } }] },
    select: { id: true, content: true },
  });
  const ids = new Set(bits.flatMap((b) => [...b.content.matchAll(/\/threads\/([a-z0-9]+)/g)].map((m) => m[1])));
  const threads = await prisma.thread.findMany({ where: { id: { in: [...ids] } }, select: { id: true, title: true } });
  // [[제목]]이 화면에서 정말 그 Thread로 풀리는 것만 — 같은 제목·개념 이름·방문자용 사전까지 화면과 같은 규칙으로 (Gemini links #1)
  const [owner, visitor] = await Promise.all([getLinkTargets(true), getLinkTargets(false)]);
  const ok = (t: { id: string; title: string }) => {
    const v = resolveLink(visitor, t.title);
    return resolveLink(owner, t.title) === t.id && (v === undefined || v === t.id);
  };
  const byId = new Map(threads.filter(ok).map((t) => [t.id, t.title]));
  const ambiguous = threads.filter((t) => !ok(t));

  let changed = 0;
  for (const b of bits) {
    const next = rewriteThreadLinks(b.content, byId);
    if (next === b.content) continue;
    changed++;
    console.log(`--- ${b.id}\n${b.content}\n+++\n${next}\n`);
    if (apply) await prisma.bit.update({ where: { id: b.id }, data: { content: next } });
  }
  console.log(`${bits.length} bits with site links, ${changed} ${apply ? "updated" : "would change"}${ambiguous.length ? `, ${ambiguous.length} threads kept as URL (title resolves elsewhere)` : ""}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
