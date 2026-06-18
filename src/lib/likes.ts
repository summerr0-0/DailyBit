import { prisma } from "@/lib/prisma";

export async function addLike(bitId: string): Promise<{ id: string; count: number }> {
  const like = await prisma.like.create({ data: { bitId }, select: { id: true } });
  const count = await prisma.like.count({ where: { bitId } });
  return { id: like.id, count };
}

export async function removeLike(likeId: string, bitId: string): Promise<number> {
  await prisma.like.deleteMany({ where: { id: likeId, bitId } });
  return prisma.like.count({ where: { bitId } });
}
