import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { getPrivateTags, addPrivateTag } from "@/lib/privateTags";

export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;
  const tags = await getPrivateTags();
  return NextResponse.json(tags);
}

const Body = z.object({ tag: z.string().min(1).max(50).toLowerCase() });

export async function POST(request: Request) {
  const authError = await requireAuth();
  if (authError) return authError;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid tag" }, { status: 400 });

  await addPrivateTag(parsed.data.tag);
  return NextResponse.json({ ok: true });
}
