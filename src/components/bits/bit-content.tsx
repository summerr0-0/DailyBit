import type { ReactNode } from "react";
import Link from "next/link";
import { TAG_PATTERN } from "@/lib/tags";
import { splitByUrls } from "@/lib/linkify";

// Bit 본문 렌더링 — http(s) URL은 새 탭 링크, 그 밖의 #태그는 태그 페이지 링크 (spec: news-curation D13).
// 홈 피드(BitCard)와 Thread 페이지가 같이 쓴다.

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
export function renderBitContent(content: string): ReactNode[] {
  return splitByUrls(content).flatMap<ReactNode>((segment) =>
    segment.type === "url"
      ? [
          <a
            key={segment.start}
            href={segment.value}
            target="_blank"
            rel="noopener noreferrer nofollow"
            style={{ color: "#B05A18", textDecoration: "underline", wordBreak: "break-all" }}
          >
            {segment.value}
          </a>,
        ]
      : renderTags(segment.value, segment.start),
  );
}

