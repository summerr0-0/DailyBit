import Link from "next/link";
import { getBitsByTag } from "@/lib/bits";
import { BitCard } from "@/components/bits/BitCard";

export const dynamic = "force-dynamic";

export default async function TagPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  // Next.js가 params를 자동 URL-디코드하므로 소문자화만 적용해 매칭한다.
  const { tag } = await params;
  const normalized = tag.toLowerCase();
  const bits = await getBitsByTag(normalized);

  return (
    <main className="max-w-xl mx-auto min-h-screen border-x border-border">
      <header className="sticky top-0 bg-background/80 backdrop-blur border-b border-border px-4 py-3">
        <Link href="/" className="text-xs text-muted-foreground hover:underline">
          ← 홈
        </Link>
        <h1 className="font-bold text-lg mt-1">#{normalized}</h1>
        <p className="text-xs text-muted-foreground">{bits.length} Bits</p>
      </header>
      {bits.length === 0 ? (
        <div className="text-center text-muted-foreground py-12 text-sm">
          #{normalized}로 작성된 Bit가 없어요.
        </div>
      ) : (
        <div>
          {bits.map((bit) => (
            <BitCard key={bit.id} bit={bit} />
          ))}
        </div>
      )}
    </main>
  );
}
