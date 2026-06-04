import type { BitWithAuthor } from "@/lib/bits";

type Props = { bit: BitWithAuthor };

export function BitCard({ bit }: Props) {
  return (
    <article className="border-b border-border px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-semibold text-sm">{bit.author.nickname}</span>
        <span className="text-muted-foreground text-xs">{bit.createdAtLabel}</span>
      </div>
      <p className="text-sm leading-relaxed">{bit.content}</p>
      {bit.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {bit.tags.map((tag) => (
            <span key={tag} className="text-xs text-blue-500">
              #{tag}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
