import { notFound } from "next/navigation";
import Link from "next/link";
import { getThread } from "@/lib/threads";
import { TAG_PATTERN } from "@/lib/tags";
import type { ReactNode } from "react";

type Props = { params: Promise<{ id: string }> };

const AI_COLLAB_LABEL = {
  NONE: null,
  HINT: "AI: Hint",
  LED: "AI: Led",
} as const;

function renderContent(content: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(TAG_PATTERN)) {
    const start = match.index ?? 0;
    const full = match[0];
    const name = match[1];

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

export default async function ThreadPage({ params }: Props) {
  const { id } = await params;
  const thread = await getThread(id);

  if (!thread) notFound();

  return (
    <main className="max-w-xl mx-auto min-h-screen border-x border-border">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b border-border px-4 py-3">
        <Link href="/" className="text-xs text-muted-foreground hover:underline">
          &larr; Home
        </Link>
        <h1 className="font-bold text-lg mt-1">{thread.title}</h1>
        <p className="text-xs text-muted-foreground">{thread.bits.length} steps</p>
      </header>

      <ol className="relative">
        {thread.bits.map((bit, i) => {
          const aiLabel = AI_COLLAB_LABEL[bit.aiCollab];
          return (
            <li key={bit.id} className="border-b border-border px-4 py-4 flex gap-3">
              {/* 단계 번호 + 세로선 */}
              <div className="flex flex-col items-center gap-1 pt-0.5">
                <span className="w-6 h-6 rounded-full border-2 border-border bg-background flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                  {i + 1}
                </span>
                {i < thread.bits.length - 1 && (
                  <div className="w-px flex-1 bg-border min-h-[1rem]" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-muted-foreground">
                    {new Date(bit.createdAt).toLocaleDateString("en-CA", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  {aiLabel && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500">
                      {aiLabel}
                    </span>
                  )}
                </div>
                <p className="text-sm leading-relaxed">{renderContent(bit.content)}</p>
                {bit.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {bit.tags.map((tag) => (
                      <Link
                        key={tag}
                        href={`/tags/${tag}`}
                        className="text-xs text-blue-500 hover:underline"
                      >
                        #{tag}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}

        {thread.bits.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">
            No steps yet. Go home and add the first step to this thread.
          </li>
        )}
      </ol>
    </main>
  );
}
