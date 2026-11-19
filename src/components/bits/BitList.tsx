import { getBitsFiltered } from "@/lib/bits";
import { getLinkTargets } from "@/lib/link-targets";
import { BitCard } from "./BitCard";
import { BitActionsMenu } from "./BitActionsMenu";
import { RebitCard } from "./RebitCard";

type Props = { filterTags?: string[]; isLoggedIn?: boolean; includePrivate?: boolean };

export async function BitList({ filterTags = [], isLoggedIn = false, includePrivate = false }: Props) {
  const [items, links] = await Promise.all([getBitsFiltered(filterTags, includePrivate), getLinkTargets()]);

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
              <RebitCard rebitAtLabel={item.rebitAtLabel} message={item.message} bit={item.bit} isLoggedIn={isLoggedIn} links={links} />
            </div>
          );
        }

        return (
          <div key={item.bit.id} style={{ position: "relative" }}>
            <BitCard bit={item.bit} isLoggedIn={isLoggedIn} links={links} />
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
