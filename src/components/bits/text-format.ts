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
