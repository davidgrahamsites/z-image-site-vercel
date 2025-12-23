import { NextResponse } from "next/server";

export const runtime = "nodejs"; // if you need Node APIs; otherwise omit

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // TODO: replace with your real generation logic
    return NextResponse.json({ ok: true, received: body });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }
}
