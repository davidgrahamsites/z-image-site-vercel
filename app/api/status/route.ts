import { NextResponse } from "next/server";

export const runtime = "nodejs";

// TODO: replace this with your real store (KV/DB/RunPod lookup).
// This placeholder makes the API behavior correct even before you wire storage.
type Status = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ ok: false, error: "Missing jobId" }, { status: 400 });
  }

  try {
    // --- Replace this section with real status lookup ---
    // For now: treat unknown IDs as NOT_FOUND (404) instead of 502.
    // If you *do* have a store, query it here and map to statuses below.
    const known = jobId.includes("-u"); // weak placeholder: remove later
    if (!known) {
      return NextResponse.json(
        { ok: false, error: "Not found", status: "NOT_FOUND", output: null },
        { status: 404 }
      );
    }

    // Pending is a normal state, not an error:
    return NextResponse.json(
      { ok: true, status: "PENDING" as Status, output: null, jobId },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Status lookup failed", jobId },
      { status: 500 }
    );
  }
}
