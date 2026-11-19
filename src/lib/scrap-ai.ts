import Anthropic from "@anthropic-ai/sdk";

// AI 요약 서비스 (spec: tech-scrap T3 / R2).
// 추출된 원문을 받아 충실한 요약 + 쉬운 보충 설명을 "영문"으로 생성한다.
// 결과는 세그먼트 배열: 1개면 단일 Bit, 2개 이상이면 Thread로 발행된다(D5).
// 태그는 각 세그먼트 본문에 인라인 #hashtag로 넣어, 발행 시 기존 parseTags/createBit가 그대로 뽑도록 한다.

// 프로젝트 기본 방침은 최신 Claude. 비용을 위해 Sonnet 등으로 바꾸려면 SCRAP_AI_MODEL로 오버라이드.
const MODEL = process.env.SCRAP_AI_MODEL ?? "claude-opus-4-8";
// 세그먼트 개수 상한(D12) — 하나의 소스가 Thread로 지나치게 잘게 쪼개지는 것을 방지.
const MAX_SEGMENTS = 8;
// 발행 Bit는 500자 이내. 모델에는 480자로 여유를 두고 요청하고, 서버에서 500자로 방어 절삭한다.
const MAX_SEGMENT_CHARS = 500;
const MAX_THREAD_TITLE_CHARS = 100;

const SYSTEM_PROMPT = `You summarize a developer article or video transcript for Irin's personal dev-learning blog ("DailyBit"). Irin later edits and publishes your draft.

Write the summary as a faithful, easy-to-understand recap with brief supplementary explanation that makes the concept click.

Rules:
- Write in English.
- Use a plain, restrained tone. Do NOT use hype or exaggerated metaphors (no "game-changer", "supercharge", "unlock", "the secret sauce", etc.).
- Stay faithful to the source. Do not invent facts the source does not support.
- Each segment must be at most 480 characters.
- If the source makes one focused point, return exactly ONE segment.
- If it spans multiple distinct sub-topics, split into an ordered sequence of segments (a Thread) where each segment is one self-contained point that builds on the previous.
- End each segment with 1-3 relevant lowercase topic hashtags inline (e.g. "#nextjs #caching"). No uppercase.
- If there are 2 or more segments, set suggestedThreadTitle to a short through-line (<= 100 chars). If there is only one segment, set it to an empty string.

Return ONLY a JSON object with keys "suggestedThreadTitle" (string) and "segments" (array of strings). No prose outside the JSON.`;

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    suggestedThreadTitle: {
      type: "string",
      description: "Through-line for a multi-segment Thread; empty string when there is a single segment.",
    },
    segments: {
      type: "array",
      description: "Ordered publish candidates. Each becomes one Bit.",
      items: { type: "string" },
    },
  },
  required: ["suggestedThreadTitle", "segments"],
} as const;

// 클라이언트는 지연 생성한다. 모듈 로드 시점(빌드 포함)에 ANTHROPIC_API_KEY가 없어도
// throw하지 않도록 하고, 실제 요청 때만 키를 요구한다.
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

export type SummarizeSuccess = {
  ok: true;
  segments: string[];
  suggestedThreadTitle: string | null;
};

export type SummarizeFailure = {
  ok: false;
  reason: "ai_failed" | "empty_output";
  message: string;
};

export type SummarizeResult = SummarizeSuccess | SummarizeFailure;

/** 단어 경계를 살려 max 길이로 방어 절삭한다. (드래프트는 Irin이 편집하고 발행 시 재검증된다) */
function clampSegment(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const slice = trimmed.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).trim();
}

/**
 * 추출 원문을 요약 세그먼트로 변환한다.
 * 실패(호출 에러/타임아웃/빈 출력)는 예외를 던지지 않고 { ok: false } 로 반환한다(D12) — 부분 draft 없음.
 */
export async function summarize(rawExtract: string, sourceTitle?: string | null): Promise<SummarizeResult> {
  const source = sourceTitle ? `Source title: ${sourceTitle}\n\nSource content:\n${rawExtract}` : rawExtract;

  let raw: string;
  try {
    const message = await getClient().messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      messages: [{ role: "user", content: source }],
    });

    if (message.stop_reason === "refusal") {
      return { ok: false, reason: "ai_failed", message: "AI가 이 내용의 요약을 거부했습니다." };
    }

    raw = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
  } catch {
    return {
      ok: false,
      reason: "ai_failed",
      message: "AI 요약 호출에 실패했습니다. 잠시 후 다시 시도하거나 원문 텍스트를 다시 붙여넣어 주세요.",
    };
  }

  let parsed: { suggestedThreadTitle?: unknown; segments?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "ai_failed", message: "AI 응답을 해석하지 못했습니다. 다시 시도해 주세요." };
  }

  const rawSegments = Array.isArray(parsed.segments) ? parsed.segments : [];
  const segments = rawSegments
    .filter((s): s is string => typeof s === "string")
    .map((s) => clampSegment(s, MAX_SEGMENT_CHARS))
    .filter((s) => s.length > 0)
    .slice(0, MAX_SEGMENTS);

  if (segments.length === 0) {
    return { ok: false, reason: "empty_output", message: "요약 결과가 비어 있습니다. 원문을 확인하고 다시 시도해 주세요." };
  }

  const titleRaw = typeof parsed.suggestedThreadTitle === "string" ? parsed.suggestedThreadTitle.trim() : "";
  const suggestedThreadTitle =
    segments.length >= 2 && titleRaw.length > 0 ? titleRaw.slice(0, MAX_THREAD_TITLE_CHARS) : null;

  return { ok: true, segments, suggestedThreadTitle };
}
