import { NextResponse } from "next/server";

export const runtime = "nodejs"; // if you need Node APIs; otherwise omit

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
return NextResponse.json(
  { ok: true, status: "PENDING", output: null },
  { status: 200 }
);

  }

  // TODO: replace with your real status lookup
  return NextResponse.json({ ok: true, status: "PENDING", jobId });
}
