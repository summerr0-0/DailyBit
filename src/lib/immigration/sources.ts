// jsdom 없이 쓰는 공통 정의 — 화면(/immigration)과 store가 jsdom을 끌어오지 않게 parse.ts에서 뺐다.
// (Vercel에서 jsdom 로드가 실패해 /immigration이 500이 됐다.)

export type Program = "EE" | "BC_PNP" | "AAIP";

export type Draw = {
  program: Program;
  stream: string;
  /** 선발 조건 (BC PNP의 Selection factors, EE의 대상 프로그램). 없으면 "" */
  detail: string;
  /** yyyy-mm-dd */
  drawDate: string;
  minScore: number | null;
  invitations: number | null;
  /** 원문 그대로 ("<5", "1,250") — 숫자로 못 바꾸는 값을 잃지 않게 */
  invitationsText: string;
  sourceUrl: string;
  /** 출처가 주는 고유 번호 (EE drawNumber). 있으면 중복 키로 쓴다 */
  ref?: string;
};

export const SOURCES = {
  EE: "https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json",
  BC_PNP: "https://www.welcomebc.ca/immigrate-to-b-c/about-the-bc-provincial-nominee-program/invitations-to-apply",
  AAIP: "https://www.alberta.ca/aaip-processing-information",
} as const satisfies Record<Program, string>;

/** 공지 페이지 — 표가 없어 본문이 바뀌었는지만 본다 (D4) */
export const WATCHED_PAGES = ["https://www.alberta.ca/aaip-updates"] as const;

export const NOTE_TAG = "immigration";
export const NOTE_THREAD_TITLE = "Canada PR draws";
export const WEEKLY_THREAD_TITLE = "Canada PR weekly";
export const NEWS_THREAD_TITLE = "Canada PR news";

/**
 * 같은 선발을 다시 넣지 않기 위한 키. EE는 공식 회차 번호(문구가 바뀌어도 그대로)를 쓰고,
 * 번호가 없는 PNP는 점수·인원까지 넣어 같은 날 같은 스트림의 다른 선발을 구분한다 (Gemini imm #4).
 */
export function drawKey(d: Pick<Draw, "program" | "drawDate" | "stream" | "detail"> & Partial<Pick<Draw, "ref" | "minScore" | "invitationsText">>): string {
  if (d.ref) return [d.program, "ref", d.ref].join("|");
  return [d.program, d.drawDate, d.stream.toLowerCase(), d.detail.toLowerCase(), d.minScore ?? "", (d.invitationsText ?? "").toLowerCase()].join("|");
}

/**
 * 개발자(NOC 2123x)에게 관련 있을 만한 선발 — 화면·알림 강조용 (D6).
 * EE는 선발 이름만 본다(대상 프로그램 설명에는 늘 "Canadian Experience Class"가 들어 있다).
 */
export function isTechRelevant(d: Pick<Draw, "program" | "stream" | "detail">): boolean {
  if (d.program === "EE") return /canadian experience|\bstem\b|^general\b|no program specified/i.test(d.stream);
  return /\btech\b|technology|innovate|high economic impact|software|computer/i.test(`${d.stream} ${d.detail}`);
}
