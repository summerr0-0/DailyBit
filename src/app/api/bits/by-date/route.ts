import { NextResponse } from "next/server";
import { getBitsByDateKST } from "@/lib/garden";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date 파라미터가 필요합니다 (yyyy-mm-dd)" }, { status: 400 });
  }

  const bits = await getBitsByDateKST(date);
  return NextResponse.json(bits);
}
