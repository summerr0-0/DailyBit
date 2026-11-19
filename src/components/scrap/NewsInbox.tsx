"use client";

import { useState } from "react";
import type { ConceptStatusDTO, ScrapDraftDTO } from "@/lib/scrap-drafts";
import { DraftCard } from "@/components/scrap/ScrapWorkbench";

// 자동 수집 뉴스·개념 초안 인박스 (spec: news-curation D12, news-curation-v2 R8).
// 편집·발행·폐기는 수동 스크랩과 같은 DraftCard / API를 쓴다 (발행 시 kind별 훅은 서버가 처리).

export type NewsInboxItem = { draft: ScrapDraftDTO; expiryLabel: string };

const MUTED = "#B4AB97";
const INK = "#3C3220";

export function NewsInbox({
  initialItems,
  conceptItems: initialConcepts = [],
  conceptStatuses = [],
}: {
  initialItems: NewsInboxItem[];
  conceptItems?: NewsInboxItem[];
  conceptStatuses?: ConceptStatusDTO[];
}) {
  const [items, setItems] = useState(initialItems);
  const [concepts, setConcepts] = useState(initialConcepts);
  const statusBySlug = new Map(conceptStatuses.map((c) => [c.slug, c]));

  return (
    <section aria-labelledby="news-inbox-heading" style={{ marginBottom: 32 }}>
      <h2 id="news-inbox-heading" style={{ fontSize: 15, fontWeight: 700, color: INK, marginBottom: 4 }}>
        News inbox <span style={{ fontWeight: 500, color: MUTED }}>({items.length})</span>
      </h2>
      <p style={{ fontSize: 12.5, color: MUTED, marginBottom: 12 }}>
        Auto-collected AI and security news, one Thread per story. Unreviewed drafts are removed after 3 days.
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
              extra={<NewsMeta draft={draft} expiryLabel={expiryLabel} statusBySlug={statusBySlug} />}
            />
          ))}
        </div>
      )}

      {concepts.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: INK, marginBottom: 4 }}>
            Concepts <span style={{ fontWeight: 500, color: MUTED }}>({concepts.length})</span>
          </h3>
          <p style={{ fontSize: 12.5, color: MUTED, marginBottom: 12 }}>
            Beginner explainers linked from news. Publishing one also links it from its published news Threads.
            Discarding it means it won&apos;t be suggested again.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {concepts.map(({ draft, expiryLabel }) => (
              <DraftCard
                key={draft.id}
                draft={draft}
                onDone={() => setConcepts((prev) => prev.filter((x) => x.draft.id !== draft.id))}
                extra={<ConceptMeta draft={draft} expiryLabel={expiryLabel} />}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function conceptLabel(slug: string, s: ConceptStatusDTO | undefined): string {
  if (!s) return `${slug} (draft not created — will retry)`;
  if (s.status === "PUBLISHED") return `${s.term} (published — linked on publish)`;
  if (s.status === "REJECTED") return `${s.term} (rejected)`;
  return s.hasDraft ? `${s.term} (draft pending)` : `${s.term} (draft not created — will retry)`;
}

function NewsMeta({
  draft,
  expiryLabel,
  statusBySlug,
}: {
  draft: ScrapDraftDTO;
  expiryLabel: string;
  statusBySlug: Map<string, ConceptStatusDTO>;
}) {
  const sourceCount = draft.eventKey ? Math.max(0, draft.segments.length - 1) : 1;
  return (
    <div data-testid="news-meta" style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 12 }}>
        {draft.sourceLabel && <span style={{ fontWeight: 600, color: INK }}>{draft.sourceLabel}</span>}
        {draft.eventKey && (
          <span style={{ color: MUTED }}>
            {sourceCount} source{sourceCount === 1 ? "" : "s"}
          </span>
        )}
        <span style={{ color: MUTED }}>{expiryLabel}</span>
      </div>
      {draft.conceptSlugs.length > 0 && (
        <ul style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, padding: 0, listStyle: "none" }}>
          {draft.conceptSlugs.map((slug) => (
            <li key={slug} style={{ fontSize: 11, color: INK, background: "#EFE8DA", borderRadius: 999, padding: "2px 8px" }}>
              Concept: {conceptLabel(slug, statusBySlug.get(slug))}
            </li>
          ))}
        </ul>
      )}
      <Warnings warnings={draft.warnings} />
    </div>
  );
}

function ConceptMeta({ draft, expiryLabel }: { draft: ScrapDraftDTO; expiryLabel: string }) {
  return (
    <div data-testid="concept-meta" style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 12 }}>
        <span style={{ fontWeight: 600, color: INK }}>{draft.sourceTitle ?? draft.sourceLabel}</span>
        <span style={{ color: MUTED }}>{expiryLabel}</span>
      </div>
      <Warnings warnings={draft.warnings} />
    </div>
  );
}

function Warnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, padding: 0, listStyle: "none" }}>
      {warnings.map((w) => (
        <li
          key={w}
          title="Check this before publishing"
          style={{ fontSize: 11, color: "#9C4A1A", background: "#FBEBDD", borderRadius: 999, padding: "2px 8px" }}
        >
          ⚠ {w}
        </li>
      ))}
    </ul>
  );
}
