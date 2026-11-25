import { notFound } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import { getConceptStatuses, getDrafts } from "@/lib/scrap-drafts";
import { ScrapWorkbench } from "@/components/scrap/ScrapWorkbench";
import { NewsInbox } from "@/components/scrap/NewsInbox";
import { ImmigrationBriefing } from "@/components/scrap/ImmigrationBriefing";
import { getWeeklyBriefing } from "@/lib/immigration/store";
import { CONCEPT_DRAFT_TTL_MS, NEWS_DRAFT_TTL_MS, isNewsDraftExpired, newsExpiryLabel } from "@/lib/news-expiry";

// 테크 글 스크랩 + 뉴스 인박스 — 오너(Irin) 전용. 방문자는 404 (R3.3, R5.1, news-curation R9.3).
export default async function ScrapPage() {
  const owner = await isLoggedIn();

  // 방문자에게는 페이지 존재 자체를 숨긴다 (404). 오너는 /login 후 로그인 완료 화면의 링크로 들어온다.
  if (!owner) notFound();

  const [drafts, newsDrafts, conceptDrafts, briefing] = await Promise.all([
    getDrafts({ kind: "MANUAL" }),
    getDrafts({ kind: "NEWS" }),
    getDrafts({ kind: "CONCEPT" }),
    // 정리를 못 읽어도 스크랩 화면은 떠야 한다
    getWeeklyBriefing().catch(() => null),
  ]);
  const now = new Date();
  // 만료 삭제는 cron이 하므로 그 사이 보관 기간이 지난 초안은 화면에서 숨긴다. 기준은 updatedAt (v2 D14-9)
  const toItems = (list: typeof newsDrafts, ttl: number) =>
    list
      .filter((d) => !isNewsDraftExpired(new Date(d.updatedAt), now, ttl))
      .map((draft) => ({ draft, expiryLabel: newsExpiryLabel(new Date(draft.updatedAt), now, ttl) }));
  const newsItems = toItems(newsDrafts, NEWS_DRAFT_TTL_MS);
  const conceptItems = toItems(conceptDrafts, CONCEPT_DRAFT_TTL_MS);
  const conceptStatuses = await getConceptStatuses(newsItems.flatMap((i) => i.draft.conceptSlugs));

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "28px 20px 80px" }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#3C3220" }}>Scrap</h1>
        <p style={{ marginTop: 6, fontSize: 13.5, color: "#B4AB97" }}>
          Paste a URL (or the raw text) and let AI draft a Bit or Thread. Nothing is published until you confirm.
        </p>
      </header>
      <ImmigrationBriefing briefing={briefing} />
      <NewsInbox initialItems={newsItems} conceptItems={conceptItems} conceptStatuses={conceptStatuses} />
      <ScrapWorkbench initialDrafts={drafts} />
    </div>
  );
}
