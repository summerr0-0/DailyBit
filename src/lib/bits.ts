import { prisma } from "@/lib/prisma";

export type BitWithAuthor = {
  id: string;
  content: string;
  tags: string[];
  createdAtLabel: string;
  author: {
    id: string;
    nickname: string;
    image: string | null;
  };
};

const formatter = new Intl.RelativeTimeFormat("ko", { numeric: "auto" });

function toRelativeLabel(date: Date): string {
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMin < 60) return formatter.format(-diffMin, "minute");
  if (diffMin < 1440) return formatter.format(-Math.floor(diffMin / 60), "hour");
  return formatter.format(-Math.floor(diffMin / 1440), "day");
}

export async function getBits(): Promise<BitWithAuthor[]> {
  const rows = await prisma.bit.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      content: true,
      tags: true,
      createdAt: true,
      author: {
        select: { id: true, nickname: true, image: true },
      },
    },
  });

  return rows.map((row) => ({
    ...row,
    createdAtLabel: toRelativeLabel(row.createdAt),
  }));
}
