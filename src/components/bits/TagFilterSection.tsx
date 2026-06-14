import { getTagCloud } from "@/lib/bits";
import { TagFilterBar } from "./TagFilterBar";

type Props = { selectedTags: string[] };

export async function TagFilterSection({ selectedTags }: Props) {
  const tags = await getTagCloud();
  return <TagFilterBar tags={tags} selectedTags={selectedTags} />;
}
