import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ROUTE_VERSION = "status-debug-001";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    const res = NextResponse.json(
      { ok: false, error: "Missing jobId" },
      { status: 400 }
    );
    res.headers.set("x-route-version", ROUTE_VERSION);
    return res;
  }

  const res = NextResponse.json(
    { ok: true, status: "PENDING", output: null },
    { status: 200 }
  );
  res.headers.set("x-route-version", ROUTE_VERSION);
  return res;
}
