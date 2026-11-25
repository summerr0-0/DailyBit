import type { WeeklyBriefing } from "@/lib/immigration/briefing";

// /scrap 맨 위 "Canada PR 이번 주 정리" 카드 (spec: immigration-daily D8). 오너 전용 화면에서만 보인다.
const MUTED = "#B4AB97";
const INK = "#3C3220";
const ACCENT = "#B07A4A";

export function ImmigrationBriefing({ briefing }: { briefing: WeeklyBriefing | null }) {
  return (
    <section
      aria-labelledby="pr-briefing-heading"
      data-testid="pr-briefing"
      style={{ marginBottom: 32, padding: "16px 18px", background: "#FBF7EF", border: "1px solid #EFE8DA", borderRadius: 12 }}
    >
      <h2 id="pr-briefing-heading" style={{ fontSize: 15, fontWeight: 700, color: INK, marginBottom: 2 }}>
        Canada PR 이번 주 정리
      </h2>
      {!briefing ? (
        <p style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>첫 정리는 다음 월요일 아침에 올라와요.</p>
      ) : (
        <>
          <p style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>
            {briefing.from} ~ {briefing.to} · AI 정리 — 중요한 건 공식 페이지에서 꼭 확인
          </p>
          <p style={{ fontSize: 14.5, fontWeight: 600, color: INK, lineHeight: 1.55, marginBottom: briefing.points.length ? 12 : 0 }}>
            {briefing.headline}
          </p>
          {briefing.points.length > 0 && (
            <ol style={{ display: "flex", flexDirection: "column", gap: 10, paddingLeft: 18, margin: 0 }}>
              {briefing.points.map((p, i) => (
                <li key={i} style={{ fontSize: 13.5, color: INK, lineHeight: 1.6 }}>
                  <strong>{p.title}</strong>
                  <div>{p.body}</div>
                </li>
              ))}
            </ol>
          )}
          {briefing.watch && (
            <p style={{ fontSize: 13, color: INK, marginTop: 12, lineHeight: 1.55 }}>
              <strong>다음에 볼 것 ·</strong> {briefing.watch}
            </p>
          )}
          {briefing.terms.length > 0 && (
            <details style={{ marginTop: 12 }}>
              <summary style={{ fontSize: 12.5, color: ACCENT, cursor: "pointer" }}>용어 풀이 ({briefing.terms.length})</summary>
              <dl style={{ marginTop: 8, display: "grid", gap: 6 }}>
                {briefing.terms.map((t) => (
                  <div key={t.term} style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                    <dt style={{ display: "inline", fontWeight: 700, color: INK }}>{t.term}</dt>
                    <dd style={{ display: "inline", marginLeft: 6, color: INK }}>{t.meaning}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
        </>
      )}
      <p style={{ fontSize: 12.5, marginTop: 12 }}>
        <a href="/immigration" style={{ color: ACCENT }}>선발 표 전체 보기 →</a>
      </p>
    </section>
  );
}
