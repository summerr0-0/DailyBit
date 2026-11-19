import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/** 서명·만료가 유효한 오너 세션 쿠키가 있는지. */
export async function isLoggedIn(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value, process.env.ADMIN_PASSPHRASE);
}

export async function requireAuth(): Promise<NextResponse | null> {
  if (!(await isLoggedIn())) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  return null;
}
