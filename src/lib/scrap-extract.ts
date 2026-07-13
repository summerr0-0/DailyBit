import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { YoutubeTranscript } from "youtube-transcript";

// 테크 글 스크랩 추출 서비스 (spec: tech-scrap T2 / R1.1~1.4).
// URL은 readability로 본문 추출, 유튜브는 자막, 텍스트는 정규화만 한다.
// 트위터/링크드인 등 로그인 벽은 서버 fetch가 빈 HTML을 받으므로 fetch_failed로 떨어뜨려
// 상위(UI)에서 수동 텍스트 붙여넣기 fallback으로 넘긴다 (D8).

const FETCH_TIMEOUT_MS = 10_000;
// 로그인 벽/JS 렌더링 페이지는 본문이 사실상 비어 있다. 이 길이 미만이면 추출 실패로 본다.
const MIN_ARTICLE_LENGTH = 200;
// AI 입력 비용/토큰 상한을 위해 원문을 자른다 (요약에는 충분한 길이).
const MAX_RAW_LENGTH = 20_000;
// 실제 브라우저처럼 보이도록 하는 최소한의 UA (일부 사이트의 봇 차단 완화).
const FETCH_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export type ExtractInput =
  | { sourceType: "URL"; url: string }
  | { sourceType: "TEXT"; rawExtract: string };

export type ExtractSuccess = {
  ok: true;
  sourceType: "URL" | "TEXT" | "YOUTUBE";
  sourceUrl: string | null;
  sourceTitle: string | null;
  rawExtract: string;
};

export type ExtractFailureReason =
  | "fetch_failed"
  | "no_transcript"
  | "empty_content"
  | "invalid_input";

export type ExtractFailure = {
  ok: false;
  reason: ExtractFailureReason;
  message: string;
};

export type ExtractResult = ExtractSuccess | ExtractFailure;

/** 공백을 정규화하고 상한 길이로 자른다. */
function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim().slice(0, MAX_RAW_LENGTH);
}

/** 유튜브 영상 URL이면 videoId를 반환, 아니면 null. */
export function getYouTubeId(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    return url.pathname.slice(1) || null;
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    if (url.pathname === "/watch") return url.searchParams.get("v");
    if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/")[2] || null;
    if (url.pathname.startsWith("/embed/")) return url.pathname.split("/")[2] || null;
  }
  return null;
}

/** 유튜브 자막을 받아 하나의 텍스트로 잇는다. 자막이 없으면 no_transcript. */
async function extractYouTube(url: string, videoId: string): Promise<ExtractResult> {
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId);
    const text = normalizeText(segments.map((s) => s.text).join(" "));
    if (text.length === 0) {
      return { ok: false, reason: "no_transcript", message: "자막이 비어 있습니다." };
    }
    return {
      ok: true,
      sourceType: "YOUTUBE",
      sourceUrl: url,
      sourceTitle: null,
      rawExtract: text,
    };
  } catch {
    return {
      ok: false,
      reason: "no_transcript",
      message: "이 영상의 자막을 가져올 수 없습니다. 원문 텍스트를 직접 붙여넣어 주세요.",
    };
  }
}

/** 일반 기사 URL을 fetch해 readability로 본문을 추출한다. */
async function extractArticle(url: string): Promise<ExtractResult> {
  let html: string;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": FETCH_UA, accept: "text/html" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });
    if (!res.ok) {
      return {
        ok: false,
        reason: "fetch_failed",
        message: `페이지를 가져오지 못했습니다 (HTTP ${res.status}). 원문 텍스트를 직접 붙여넣어 주세요.`,
      };
    }
    html = await res.text();
  } catch {
    return {
      ok: false,
      reason: "fetch_failed",
      message: "페이지를 가져오지 못했습니다. 원문 텍스트를 직접 붙여넣어 주세요.",
    };
  }

  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  const content = article?.textContent ? normalizeText(article.textContent) : "";

  // 로그인 벽/JS 렌더링 페이지(트위터·링크드인 등)는 본문이 사실상 비어 있다 → fetch_failed로 fallback 유도.
  if (content.length < MIN_ARTICLE_LENGTH) {
    return {
      ok: false,
      reason: "fetch_failed",
      message:
        "본문을 추출하지 못했습니다 (로그인이 필요하거나 스크립트로 렌더링되는 페이지일 수 있어요). 원문 텍스트를 직접 붙여넣어 주세요.",
    };
  }

  return {
    ok: true,
    sourceType: "URL",
    sourceUrl: url,
    sourceTitle: article?.title?.trim() || null,
    rawExtract: content,
  };
}

/**
 * 입력 소스에서 요약용 원문을 추출한다.
 * - TEXT: fetch 없이 정규화만
 * - URL: 유튜브면 자막, 아니면 기사 본문(readability)
 * 실패는 예외를 던지지 않고 { ok: false, reason } 로 반환한다 (상위에서 fallback 처리).
 */
export async function extractSource(input: ExtractInput): Promise<ExtractResult> {
  if (input.sourceType === "TEXT") {
    const text = normalizeText(input.rawExtract);
    if (text.length === 0) {
      return { ok: false, reason: "invalid_input", message: "텍스트가 비어 있습니다." };
    }
    return { ok: true, sourceType: "TEXT", sourceUrl: null, sourceTitle: null, rawExtract: text };
  }

  const url = input.url.trim();
  try {
    // URL 형식 검증
    new URL(url);
  } catch {
    return { ok: false, reason: "invalid_input", message: "올바른 URL이 아닙니다." };
  }

  const videoId = getYouTubeId(url);
  if (videoId) return extractYouTube(url, videoId);
  return extractArticle(url);
}
