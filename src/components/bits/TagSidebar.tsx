import { getTagCloud } from "@/lib/bits";
import { getStats } from "@/lib/garden";
import { TagSidebarClient } from "./TagSidebarClient";

type Props = { selectedTags: string[]; isLoggedIn?: boolean };

export async function TagSidebar({ selectedTags, isLoggedIn = false }: Props) {
  const [tags, stats] = await Promise.all([getTagCloud(isLoggedIn), getStats()]);
  return (
    <TagSidebarClient
      tags={tags}
      totalCount={stats.totalBits}
      selectedTags={selectedTags}
      isLoggedIn={isLoggedIn}
    />
  );
}
