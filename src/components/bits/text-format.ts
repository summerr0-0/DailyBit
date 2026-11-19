// 입력창 서식 도우미 (사용자 요청 2026-11-20: 에디터 굵게 지원).
// 선택한 글자를 **…**로 감싼다. 이미 감싸져 있으면 벗긴다. 선택이 없으면 빈 **|** 를 넣고 커서를 가운데 둔다.

export type Edit = { value: string; selectionStart: number; selectionEnd: number };

export function toggleBold(value: string, start: number, end: number): Edit {
  const selected = value.slice(start, end);
  const before = value.slice(0, start);
  const after = value.slice(end);

  // 선택 바깥에 **가 붙어 있으면 벗긴다: **[sel]**
  if (before.endsWith("**") && after.startsWith("**")) {
    const v = before.slice(0, -2) + selected + after.slice(2);
    return { value: v, selectionStart: start - 2, selectionEnd: end - 2 };
  }
  // 선택 자체가 **…** 이면 벗긴다
  if (selected.length >= 4 && selected.startsWith("**") && selected.endsWith("**") && !selected.slice(2, -2).includes("**")) {
    const inner = selected.slice(2, -2);
    return { value: before + inner + after, selectionStart: start, selectionEnd: start + inner.length };
  }
  const v = `${before}**${selected}**${after}`;
  return { value: v, selectionStart: start + 2, selectionEnd: end + 2 };
}

/**
 * 커서가 있는 줄에 제목 서식을 토글한다 (spec wiki-links D6).
 * 같은 레벨이면 제거, 다른 레벨이면 교체, 없으면 추가. 커서는 같은 글자 위치를 유지.
 */
export function toggleHeading(value: string, cursor: number, level: 1 | 2 | 3): Edit {
  // cursor 0이면 lastIndexOf(-1)이 0으로 취급돼 첫 줄이 빈 줄일 때 어긋난다 (Gemini wiki #3)
  const lineStart = cursor <= 0 ? 0 : value.lastIndexOf("\n", cursor - 1) + 1;
  const lineEndIdx = value.indexOf("\n", cursor);
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
  const line = value.slice(lineStart, lineEnd);
  const m = /^(#{1,3}) /.exec(line);
  const prefix = `${"#".repeat(level)} `;
  let nextLine: string;
  if (m && m[1].length === level) nextLine = line.slice(m[0].length);
  else if (m) nextLine = prefix + line.slice(m[0].length);
  else nextLine = prefix + line;
  const delta = nextLine.length - line.length;
  const pos = Math.max(lineStart, cursor + delta);
  return { value: value.slice(0, lineStart) + nextLine + value.slice(lineEnd), selectionStart: pos, selectionEnd: pos };
}

/** 커서 앞이 `[[부분` 이면 그 부분 문자열과 시작 위치 (자동완성용) */
export function wikiQueryAt(value: string, cursor: number): { query: string; start: number } | null {
  const before = value.slice(0, cursor);
  const m = /\[\[([^\[\]\n|]{0,60})$/.exec(before);
  return m ? { query: m[1], start: cursor - m[0].length } : null;
}

/** `[[부분`을 `[[제목]]`으로 바꾸고 커서를 뒤로 */
export function insertWikiLink(value: string, cursor: number, start: number, title: string): Edit {
  const link = `[[${title}]]`;
  const rest = value.slice(cursor).startsWith("]]") ? value.slice(cursor + 2) : value.slice(cursor);
  const v = value.slice(0, start) + link + rest;
  const pos = start + link.length;
  return { value: v, selectionStart: pos, selectionEnd: pos };
}
