import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function isLoggedIn(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get("db_auth")?.value === "1";
}

export async function requireAuth(): Promise<NextResponse | null> {
  const cookieStore = await cookies();
  if (cookieStore.get("db_auth")?.value !== "1") {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  return null;
}
