import { getBits } from "@/lib/bits";
import { BitCard } from "./BitCard";
import { DeleteBitButton } from "./DeleteBitButton";

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
        <div key={bit.id} className="group relative">
          <BitCard bit={bit} />
          <div className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <DeleteBitButton bitId={bit.id} />
          </div>
        </div>
      ))}
    </div>
  );
}
