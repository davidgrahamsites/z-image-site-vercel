import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ROUTE_VERSION = "status-v3-2025-12-24-01"; // change this string any time you redeploy

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    const res = NextResponse.json({ ok: false, error: "Missing jobId" }, { status: 400 });
    res.headers.set("x-route-version", ROUTE_VERSION);
    return res;
  }

  try {
    // Baseline: do NOT return 5xx for "not ready"
    const res = NextResponse.json(
      { ok: true, status: "PENDING", output: null, jobId },
      { status: 200 }
    );
    res.headers.set("x-route-version", ROUTE_VERSION);
    return res;
  } catch (e: any) {
    const res = NextResponse.json(
      { ok: false, error: e?.message ?? "Status lookup failed", jobId },
      { status: 500 }
    );
    res.headers.set("x-route-version", ROUTE_VERSION);
    return res;
  }
}
