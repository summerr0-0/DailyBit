import { getTagCloud } from "@/lib/bits";
import { getStats } from "@/lib/garden";
import { TagSidebarClient } from "./TagSidebarClient";

type Props = { selectedTags: string[] };

export async function TagSidebar({ selectedTags }: Props) {
  const [tags, stats] = await Promise.all([getTagCloud(), getStats()]);
  return (
    <TagSidebarClient
      tags={tags}
      totalCount={stats.totalBits}
      selectedTags={selectedTags}
    />
  );
}
