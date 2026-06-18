import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAndDeleteComment, deleteComment } from "@/lib/comments";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cookieStore = await cookies();
  const isOwner = cookieStore.get("db_auth")?.value === "1";

  if (isOwner) {
    // Blog owner can always delete
    const deleted = await deleteComment(id);
    if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  }

  // Regular user must provide the password they set when posting
  let password = "";
  try {
    const body = (await request.json()) as { password?: string };
    password = body.password ?? "";
  } catch { /* no body */ }

  const result = await verifyAndDeleteComment(id, password);

  if (result === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (result === "wrong_password") return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  return new NextResponse(null, { status: 204 });
}
