import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  // Restore the 400 you deleted:
  if (!jobId) {
    return NextResponse.json(
      { ok: false, error: "Missing jobId" },
      { status: 400 }
    );
  }

  try {
    // TODO: replace with your real lookup (RunPod / DB / KV)
    // For now, never return 5xx just because it's not ready.
    return NextResponse.json(
      { ok: true, status: "PENDING", output: null, jobId },
      { status: 200 }
    );
  } catch (e: any) {
    // True server error only:
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Status lookup failed", jobId },
      { status: 500 }
    );
  }
}
