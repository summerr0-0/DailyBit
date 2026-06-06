import { getFeed } from "@/lib/feed";
import { BitCard } from "./BitCard";
import { DeleteBitButton } from "./DeleteBitButton";

export async function BitList() {
  const items = await getFeed();

  if (items.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12 text-sm">
        아직 Bit가 없습니다.
      </div>
    );
  }

  return (
    <div>
      {items.map((item) => (
        <div key={item.key} className="group relative">
          {item.kind === "rebit" && (
            <p className="px-4 pt-2 text-xs text-muted-foreground">
              {item.rebitedBy}님이 Rebit함
            </p>
          )}
          <BitCard
            bit={item.bit}
            rebit={{ count: item.rebitCount, byMe: item.rebitedByMe }}
          />
          <div className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <DeleteBitButton bitId={item.bit.id} />
          </div>
        </div>
      ))}
    </div>
  );
}
