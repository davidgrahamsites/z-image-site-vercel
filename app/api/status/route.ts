import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ApiStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

function mapRunPodStatus(s: any): ApiStatus {
  // RunPod responses vary slightly by product/path; normalize defensively.
  const status = String(s ?? "").toUpperCase();

  if (status.includes("COMPLETED") || status.includes("SUCCESS")) return "COMPLETED";
  if (status.includes("FAILED") || status.includes("ERROR") || status.includes("CANCEL")) return "FAILED";
  if (status.includes("RUNNING") || status.includes("IN_PROGRESS") || status.includes("EXECUTING")) return "RUNNING";
  return "PENDING";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ ok: false, error: "Missing jobId" }, { status: 400 });
  }

  const RUNPOD_BASE_URL = process.env.RUNPOD_BASE_URL; // e.g. https://api.runpod.ai/v2
  const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;

  if (!RUNPOD_BASE_URL || !RUNPOD_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "Server not configured (missing RUNPOD_BASE_URL or RUNPOD_API_KEY)" },
      { status: 500 }
    );
  }

  const url = `${RUNPOD_BASE_URL}/${jobId}`;
  console.log("RUNPOD_STATUS_URL =", url);

  try {
    const r = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${RUNPOD_API_KEY}`,
      },
    });

    const text = await r.text();

    // RunPod returns 404 when the jobId is unknown/expired/etc.
    if (r.status === 404) {
      return NextResponse.json(
        { ok: false, error: "Not found", status: "NOT_FOUND", output: null, jobId },
        { status: 404 }
      );
    }

    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: "Upstream status failed", upstream_status: r.status, upstream: text, jobId },
        { status: 502 }
      );
    }

    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { ok: false, error: "Upstream returned non-JSON", upstream: text, jobId },
        { status: 502 }
      );
    }

    // Common RunPod shapes:
    // - { status, output, ... }
    // - { id, status, output, ... }
    // - { delayTime, executionTime, status, output, ... }
    const normalizedStatus = mapRunPodStatus(data?.status);

    if (normalizedStatus === "COMPLETED") {
      // Expect your worker to place { image_b64, ... } into output, similar to your earlier successful example
      return NextResponse.json(
        { ok: true, status: "COMPLETED" as ApiStatus, output: data?.output ?? null, jobId },
        { status: 200 }
      );
    }

    if (normalizedStatus === "FAILED") {
      return NextResponse.json(
        {
          ok: true,
          status: "FAILED" as ApiStatus,
          output: data?.output ?? null,
          error: data?.error ?? data?.message ?? null,
          jobId,
        },
        { status: 200 }
      );
    }

    // PENDING/RUNNING
    return NextResponse.json(
      { ok: true, status: normalizedStatus, output: data?.output ?? null, jobId },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Status lookup failed", jobId },
      { status: 500 }
    );
  }
}
