import { prisma } from "@/lib/prisma";

export async function getPrivateTags(): Promise<string[]> {
  const rows = await prisma.privateTag.findMany({ select: { tag: true } });
  return rows.map((r) => r.tag);
}

export async function addPrivateTag(tag: string): Promise<void> {
  await prisma.privateTag.upsert({
    where: { tag },
    update: {},
    create: { tag },
  });
}

export async function removePrivateTag(tag: string): Promise<void> {
  await prisma.privateTag.deleteMany({ where: { tag } });
}

export async function isPrivateTag(tag: string): Promise<boolean> {
  const row = await prisma.privateTag.findUnique({ where: { tag } });
  return !!row;
}
