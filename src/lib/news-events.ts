// 뉴스 사건 묶기·개념 매칭용 순수 함수 (spec: news-curation-v2 D1, D5, R1.2, R1.4).
// DB·next 의존 없음 — cron 스크립트와 테스트에서 그대로 쓴다.

const EVENT_KEY_MAX = 60;

/** 모델이 낸 event 키를 소문자 kebab([a-z0-9-], 60자 이하)으로 정규화한다. 쓸 글자가 없으면 "". */
export function normalizeEventKey(raw: string): string {
  return raw
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, EVENT_KEY_MAX)
    .replace(/-+$/u, "");
}

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "of",
  "to",
  "in",
  "on",
  "for",
  "and",
  "or",
  "with",
  "by",
  "at",
  "from",
  "is",
  "are",
  "its",
  "as",
]);

function titleWords(title: string): Set<string> {
  return new Set(
    title
      .normalize("NFKD")
      .toLowerCase()
      .split(/[^a-z0-9]+/u)
      .filter((w) => w && !STOPWORDS.has(w)),
  );
}

/**
 * 두 제목의 단어 겹침 비율(0~1) = 공통 단어 수 / 더 짧은 쪽 단어 수.
 * 같은 사건을 다르게 쓴 제목(한쪽이 더 긴 경우)도 잡도록 Jaccard 대신 짧은 쪽 기준을 쓴다. 불용어는 뺀다.
 */
export function titleOverlap(a: string, b: string): number {
  const wa = titleWords(a);
  const wb = titleWords(b);
  const smaller = Math.min(wa.size, wb.size);
  if (smaller === 0) return 0;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / smaller;
}

export type SplitSuspect = { a: string; b: string; overlap: number };

/**
 * 서로 다른 eventKey인데 제목이 threshold 이상 겹치는 쌍을 찾는다 (R1.4 `event_split_suspect` 로그용).
 * 같은 키가 여러 번 나오면 제목마다 비교하고, 키 쌍당 최대 겹침 1건만 돌려준다. a < b 사전순.
 */
export function findSplitSuspects(groups: { eventKey: string; title: string }[], threshold = 0.7): SplitSuspect[] {
  const best = new Map<string, SplitSuspect>();
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const x = groups[i];
      const y = groups[j];
      if (x.eventKey === y.eventKey) continue;
      const overlap = titleOverlap(x.title, y.title);
      if (overlap < threshold) continue;
      const [a, b] = x.eventKey < y.eventKey ? [x.eventKey, y.eventKey] : [y.eventKey, x.eventKey];
      const id = `${a}\u0000${b}`;
      const prev = best.get(id);
      if (!prev || overlap > prev.overlap) best.set(id, { a, b, overlap });
    }
  }
  return [...best.values()];
}

/** 개념 term/alias 매칭 키: 소문자, 공백·하이픈·밑줄·기타 기호 제거 ("4-bit Quantization" → "4bitquantization"). */
export function normalizeConceptSlug(term: string): string {
  return term
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, "");
}
