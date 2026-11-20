import type { ReactNode } from "react";
import Link from "next/link";
import { TAG_PATTERN } from "@/lib/tags";
import { splitByUrls } from "@/lib/linkify";
import { resolveLink, splitWikiLinks, type LinkTargets } from "@/lib/wiki-links";
import { splitFences } from "@/lib/code-fence";
import { CodeBlock, MermaidDiagram } from "./MermaidDiagram";

// Bit 본문 렌더링 — http(s) URL은 새 탭 링크, 그 밖의 #태그는 태그 페이지 링크 (spec: news-curation D13).
// 홈 피드(BitCard)와 Thread 페이지가 같이 쓴다.
// + [[링크]](Thread·개념, spec wiki-links D1/D2), 줄 앞 # ## ### 제목(D6), **굵게**.

function renderTags(text: string, offset: number): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(TAG_PATTERN)) {
    const start = match.index ?? 0;
    const full = match[0];
    const name = match[1];

    if (start > lastIndex) nodes.push(text.slice(lastIndex, start));
    nodes.push(
      <Link
        key={offset + start}
        href={`/tags/${name.toLowerCase()}`}
        style={{ color: "#B05A18", fontWeight: 600 }}
      >
        {full}
      </Link>,
    );
    lastIndex = start + full.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

// URL 구간을 먼저 떼어낸 뒤 나머지 텍스트에서만 #태그를 링크로 만든다 (spec D13).
// **굵게** — 줄을 넘지 않는 짝지어진 ** 사이만 (사용자 요청 2026-11-20)
// **굵게**, ~~취소선~~ — 마크다운처럼 기호 바로 안쪽에 공백·기호가 없을 때만 (Gemini strike #2~#4).
// "반가워~~ 오늘 ~~일정~~"의 앞 ~~는 서식이 아니다. 서로 감싸는 것은 허용(**~~x~~**).
// 기호별로: 같은 기호가 붙어 있지 않고, 안쪽 끝이 공백·같은 기호가 아닐 때만. 다른 기호는 안쪽에 와도 된다.
const MARK_PATTERN =
  /(?<!\*)\*\*(?![\s*])([^\n]*?[^\s*])\*\*(?!\*)|(?<!~)~~(?![\s~])([^\n]*?[^\s~])~~(?!~)/g;

function renderBoldAndTags(text: string, offset: number, depth = 0): ReactNode[] {
  if (depth > 2) return renderTags(text, offset);
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MARK_PATTERN)) {
    const start = m.index ?? 0;
    if (start > last) nodes.push(...renderTags(text.slice(last, start), offset + last));
    const isBold = m[1] !== undefined;
    const inner = renderBoldAndTags(isBold ? m[1] : m[2], offset + start + 2, depth + 1);
    nodes.push(
      isBold ? (
        <strong key={`b${offset + start}`}>{inner}</strong>
      ) : (
        <del key={`s${offset + start}`} style={{ color: "#8A8170" }}>
          {inner}
        </del>
      ),
    );
    last = start + m[0].length;
  }
  if (last < text.length) nodes.push(...renderTags(text.slice(last), offset + last));
  return nodes;
}

function renderInline(text: string, offset: number): ReactNode[] {
  return splitByUrls(text).flatMap<ReactNode>((segment) =>
    segment.type === "url"
      ? [
          <a
            key={`u${offset + segment.start}`}
            href={segment.value}
            target="_blank"
            rel="noopener noreferrer nofollow"
            style={{ color: "#B05A18", textDecoration: "underline", wordBreak: "break-all" }}
          >
            {segment.value}
          </a>,
        ]
      : renderBoldAndTags(segment.value, offset + segment.start),
  );
}

function renderLine(line: string, offset: number, links: LinkTargets | undefined): ReactNode[] {
  const nodes: ReactNode[] = [];
  let pos = 0;
  for (const tok of splitWikiLinks(line)) {
    if (tok.type === "text") {
      nodes.push(...renderInline(tok.value, offset + pos));
      pos += tok.value.length;
      continue;
    }
    const threadId = resolveLink(links, tok.target);
    nodes.push(
      threadId ? (
        <Link
          key={`w${offset + pos}`}
          href={`/threads/${threadId}`}
          style={{ color: "#B05A18", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3 }}
        >
          {tok.label}
        </Link>
      ) : (
        // 대상이 없으면(예: 미발행 개념) 링크 없이 글자만 (D2)
        <span key={`w${offset + pos}`}>{tok.label}</span>
      ),
    );
    pos += tok.raw.length;
  }
  return nodes;
}

const HEADING_PATTERN = /^(#{1,3}) (.+)$/;
const HEADING_SIZE = { 1: 22, 2: 19, 3: 17 } as const;

/**
 * Bit 본문을 렌더링한다. links를 주면 [[대상]]을 해당 Thread 링크로 바꾼다(없으면 글자만).
 * 줄 맨 앞 `# ` `## ` `### `는 제목 블록(D6) — p 안에 들어가므로 span(role=heading)으로 그린다.
 */
export function renderBitContent(content: string, links?: LinkTargets): ReactNode[] {
  // ``` 코드 블록(```mermaid 는 도표)을 먼저 떼어 내고, 나머지 글만 서식·링크로 해석한다
  const nodes: ReactNode[] = [];
  let offset = 0;
  for (const seg of splitFences(content)) {
    if (seg.type === "code") {
      nodes.push(
        seg.lang === "mermaid" ? (
          <MermaidDiagram key={`m${offset}`} code={seg.code} />
        ) : (
          <CodeBlock key={`c${offset}`} code={seg.code} />
        ),
      );
    } else {
      // 블록 앞뒤의 줄바꿈 하나는 블록 자체가 줄을 차지하므로 뺀다
      const text = seg.value.replace(/^\n/, "").replace(/\n$/, "");
      if (text) nodes.push(...renderText(text, offset, links));
    }
    offset += seg.type === "code" ? seg.raw.length : seg.value.length;
  }
  return nodes;
}

function renderText(content: string, base: number, links?: LinkTargets): ReactNode[] {
  const nodes: ReactNode[] = [];
  let offset = base;
  const lines = content.split("\n");
  const isHeading = (l: string | undefined) => l !== undefined && HEADING_PATTERN.test(l);
  lines.forEach((line, i) => {
    const h = HEADING_PATTERN.exec(line);
    if (h) {
      const level = h[1].length as 1 | 2 | 3;
      nodes.push(
        <span
          key={`h${offset}`}
          role="heading"
          aria-level={level}
          style={{ display: "block", fontSize: HEADING_SIZE[level], fontWeight: 700, lineHeight: 1.35, margin: "4px 0 2px" }}
        >
          {renderLine(h[2], offset + h[1].length + 1, links)}
        </span>,
      );
    } else {
      nodes.push(...renderLine(line, offset, links));
      // 다음 줄이 제목(블록)이면 줄바꿈을 넣지 않는다 — 제목 위 빈 줄 방지 (Gemini wiki #7)
      if (i < lines.length - 1 && !isHeading(lines[i + 1])) nodes.push("\n");
    }
    offset += line.length + 1;
  });
  return nodes;
}
