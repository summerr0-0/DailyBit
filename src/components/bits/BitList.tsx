import { getBits } from "@/lib/bits";
import { BitCard } from "./BitCard";

export async function BitList() {
  const bits = await getBits();

  if (bits.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12 text-sm">
        아직 Bit가 없습니다.
      </div>
    );
  }

  return (
    <div>
      {bits.map((bit) => (
        <BitCard key={bit.id} bit={bit} />
      ))}
    </div>
  );
}
