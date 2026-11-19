"use client";

import { useState } from "react";
import type { ScrapDraftDTO } from "@/lib/scrap-drafts";
import { DraftCard } from "@/components/scrap/ScrapWorkbench";

// 자동 수집 뉴스 초안 인박스 (spec: news-curation D12, R9.2, R9.4).
// 편집·발행·폐기는 수동 스크랩과 같은 DraftCard / API를 쓴다.

export type NewsInboxItem = { draft: ScrapDraftDTO; expiryLabel: string };

const MUTED = "#B4AB97";

export function NewsInbox({ initialItems }: { initialItems: NewsInboxItem[] }) {
  const [items, setItems] = useState(initialItems);

  return (
    <section aria-labelledby="news-inbox-heading" style={{ marginBottom: 32 }}>
      <h2 id="news-inbox-heading" style={{ fontSize: 15, fontWeight: 700, color: "#3C3220", marginBottom: 4 }}>
        News inbox <span style={{ fontWeight: 500, color: MUTED }}>({items.length})</span>
      </h2>
      <p style={{ fontSize: 12.5, color: MUTED, marginBottom: 12 }}>
        Auto-collected AI and security news. Unreviewed drafts are removed after 3 days.
      </p>
      {items.length === 0 ? (
        <p style={{ fontSize: 13, color: MUTED, textAlign: "center", padding: "12px 0" }}>No news drafts right now.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {items.map(({ draft, expiryLabel }) => (
            <DraftCard
              key={draft.id}
              draft={draft}
              onDone={() => setItems((prev) => prev.filter((x) => x.draft.id !== draft.id))}
              extra={<NewsMeta draft={draft} expiryLabel={expiryLabel} />}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function NewsMeta({ draft, expiryLabel }: { draft: ScrapDraftDTO; expiryLabel: string }) {
  return (
    <div data-testid="news-meta" style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 12 }}>
        {draft.sourceLabel && <span style={{ fontWeight: 600, color: "#3C3220" }}>{draft.sourceLabel}</span>}
        <span style={{ color: MUTED }}>{expiryLabel}</span>
      </div>
      {draft.warnings.length > 0 && (
        <ul style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, padding: 0, listStyle: "none" }}>
          {draft.warnings.map((w) => (
            <li
              key={w}
              title="Check this before publishing"
              style={{ fontSize: 11, color: "#9C4A1A", background: "#FBEBDD", borderRadius: 999, padding: "2px 8px" }}
            >
              ⚠ {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
