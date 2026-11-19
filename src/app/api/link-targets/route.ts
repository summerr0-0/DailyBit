import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getLinkSuggestions } from "@/lib/link-targets";

// [[ 자동완성 목록 (오너 전용 — 에디터는 오너만 쓴다). spec: wiki-links D3
export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;
  return NextResponse.json(await getLinkSuggestions());
}
