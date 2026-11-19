import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSION_MAX_AGE_SEC, createSessionToken } from "@/lib/session";

// Simple in-memory rate limiter: 5 attempts per IP per 15 minutes.
// Survives across warm Vercel invocations; resets on cold start (acceptable for personal blog).
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in 15 minutes." },
      { status: 429 },
    );
  }

  const expected = process.env.ADMIN_PASSPHRASE;
  if (!expected) {
    return NextResponse.json({ error: "Server not configured." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const { passphrase } = body as { passphrase?: string };

  if (!passphrase || passphrase !== expected) {
    return NextResponse.json({ error: "Invalid passphrase" }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, createSessionToken(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
