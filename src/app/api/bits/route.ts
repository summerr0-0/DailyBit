import { NextResponse } from "next/server";
import { getBits } from "@/lib/bits";

export async function GET() {
  const bits = await getBits();
  return NextResponse.json(bits);
}
