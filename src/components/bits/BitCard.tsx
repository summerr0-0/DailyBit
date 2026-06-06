import type { ReactNode } from "react";
import Link from "next/link";
import { TAG_PATTERN } from "@/lib/tags";
import type { BitWithAuthor } from "@/lib/bits";
import { RebitButton } from "./RebitButton";

type Props = {
  bit: BitWithAuthor;
  rebit?: { count: number; byMe: boolean };
};

/**
 * 본문을 #태그 경계로 분할해 렌더한다.
 * - #태그 토큰은 /tags/{소문자} 링크 (표시는 원문 케이스 그대로)
 * - 나머지는 일반 텍스트
 * matchAll은 정규식의 lastIndex를 변경하지 않으므로 공유 TAG_PATTERN을 그대로 쓴다.
 */
function renderContent(content: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(TAG_PATTERN)) {
    const start = match.index ?? 0;
    const full = match[0]; // "#일상"
    const name = match[1]; // "일상"

    if (start > lastIndex) nodes.push(content.slice(lastIndex, start));
    nodes.push(
      <Link
        key={start}
        href={`/tags/${name.toLowerCase()}`}
        className="text-blue-500 hover:underline"
      >
        {full}
      </Link>,
    );
    lastIndex = start + full.length;
  }

  if (lastIndex < content.length) nodes.push(content.slice(lastIndex));
  return nodes;
}

export function BitCard({ bit, rebit }: Props) {
  return (
    <article className="border-b border-border px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-semibold text-sm">{bit.author.nickname}</span>
        <span className="text-muted-foreground text-xs">{bit.createdAtLabel}</span>
      </div>
      <p className="text-sm leading-relaxed">{renderContent(bit.content)}</p>
      {rebit && (
        <div className="flex">
          <RebitButton bitId={bit.id} count={rebit.count} active={rebit.byMe} />
        </div>
      )}
    </article>
  );
}
