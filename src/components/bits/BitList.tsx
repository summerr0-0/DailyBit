import { getBitsFiltered } from "@/lib/bits";
import { BitCard } from "./BitCard";
import { BitActionsMenu } from "./BitActionsMenu";
import { RebitCard } from "./RebitCard";

type Props = { filterTags?: string[]; isLoggedIn?: boolean; includePrivate?: boolean };

export async function BitList({ filterTags = [], isLoggedIn = false, includePrivate = false }: Props) {
  const items = await getBitsFiltered(filterTags, includePrivate);

  if (items.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12 text-sm">
        {filterTags.length > 0
          ? `No entries tagged #${filterTags.join(", #")}.`
          : "No entries yet."}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {items.map((item) => {
        if (item.kind === "rebit") {
          return (
            <div key={item.rebitId} style={{ position: "relative" }}>
              <RebitCard rebitAtLabel={item.rebitAtLabel} message={item.message} bit={item.bit} isLoggedIn={isLoggedIn} />
            </div>
          );
        }

        return (
          <div key={item.bit.id} style={{ position: "relative" }}>
            <BitCard bit={item.bit} isLoggedIn={isLoggedIn} />
            {isLoggedIn && (
              <div style={{ position: "absolute", right: "12px", top: "12px" }}>
                <BitActionsMenu bitId={item.bit.id} pinned={item.bit.pinned} isPrivate={item.bit.private} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
