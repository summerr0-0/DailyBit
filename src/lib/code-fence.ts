// ``` 코드 블록 분리 (사용자 요청 2026-11-20: Mermaid 도표). 순수 함수 — 서버·클라이언트 공용.
// 블록 안은 서식·#태그·[[링크]]로 해석하지 않는다 (Mermaid의 A[[x]], style fill:#f9f 등과 충돌 방지).

export type FenceSegment = { type: "text"; value: string } | { type: "code"; lang: string; code: string; raw: string };

// 줄 단위로 읽는다 (Gemini mermaid #2): 여는 줄 = ```lang, 닫는 줄 = ``` 만 있는 줄. 빈 블록 허용.
// 닫히기 전에 ```lang 줄이 또 나오거나 끝까지 안 닫히면, 앞의 여는 줄은 일반 글로 두고 그 다음 줄부터 다시 본다
// — 닫히지 않은 블록이 뒤의 글(#태그, [[링크]])을 삼키지 않게.
const OPEN = /^```([A-Za-z0-9_-]*)[ \t]*$/;
const CLOSE = /^```[ \t]*$/;

export function splitFences(content: string): FenceSegment[] {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const out: FenceSegment[] = [];
  let textLines: string[] = [];
  const flushText = (trailingNewline: boolean) => {
    if (textLines.length === 0) return;
    out.push({ type: "text", value: textLines.join("\n") + (trailingNewline ? "\n" : "") });
    textLines = [];
  };
  let i = 0;
  while (i < lines.length) {
    const open = OPEN.exec(lines[i]);
    if (open) {
      let j = i + 1;
      while (j < lines.length && !CLOSE.test(lines[j]) && !OPEN.exec(lines[j])?.[1]) j++;
      if (j < lines.length && CLOSE.test(lines[j])) {
        flushText(true);
        const code = lines.slice(i + 1, j).join("\n");
        out.push({ type: "code", lang: open[1].toLowerCase(), code, raw: lines.slice(i, j + 1).join("\n") });
        i = j + 1;
        if (i < lines.length) textLines.push(""); // 블록 뒤 줄바꿈 자리 — 다음 text가 "\n…"으로 시작
        continue;
      }
    }
    textLines.push(lines[i]);
    i++;
  }
  flushText(false);
  return out;
}

/** 코드 블록을 빼고 남은 글 (태그·링크 추출용) */
export function withoutFences(content: string): string {
  return splitFences(content)
    .map((s) => (s.type === "text" ? s.value : "\n"))
    .join("");
}
