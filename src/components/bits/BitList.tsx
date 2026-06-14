import { getBitsFiltered } from "@/lib/bits";
import { BitCard } from "./BitCard";
import { BitActionsMenu } from "./BitActionsMenu";

type Props = { filterTags?: string[] };

export async function BitList({ filterTags = [] }: Props) {
  const bits = await getBitsFiltered(filterTags);

  if (bits.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12 text-sm">
        {filterTags.length > 0
          ? `#${filterTags.join(", #")} 태그가 달린 기록이 없습니다.`
          : "아직 기록이 없습니다."}
      </div>
    );
  }

  return (
    <div>
      {bits.map((bit) => (
        <div key={bit.id} className="relative">
          <BitCard bit={bit} />
          <div className="absolute right-3 top-3">
            <BitActionsMenu bitId={bit.id} pinned={bit.pinned} />
          </div>
        </div>
      ))}
    </div>
  );
}
