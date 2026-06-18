import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export type CommentItem = {
  id: string;
  content: string;
  author: string;
  createdAt: string;
};

export async function getComments(bitId: string): Promise<CommentItem[]> {
  const rows = await prisma.comment.findMany({
    where: { bitId },
    orderBy: { createdAt: "desc" },
    select: { id: true, content: true, author: true, createdAt: true },
  });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export async function createComment(
  bitId: string,
  content: string,
  author: string,
  password: string,
): Promise<CommentItem> {
  const row = await prisma.comment.create({
    data: {
      bitId,
      content: content.trim(),
      author: author.trim() || "Anonymous",
      passwordHash: password ? await bcrypt.hash(password, 10) : null,
    },
    select: { id: true, content: true, author: true, createdAt: true },
  });
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export async function verifyAndDeleteComment(id: string, password: string): Promise<"deleted" | "wrong_password" | "not_found"> {
  const comment = await prisma.comment.findUnique({
    where: { id },
    select: { passwordHash: true },
  });
  if (!comment) return "not_found";

  if (comment.passwordHash && !(await bcrypt.compare(password, comment.passwordHash))) {
    return "wrong_password";
  }

  await prisma.comment.delete({ where: { id } });
  return "deleted";
}

export async function deleteComment(id: string): Promise<boolean> {
  const { count } = await prisma.comment.deleteMany({ where: { id } });
  return count > 0;
}
