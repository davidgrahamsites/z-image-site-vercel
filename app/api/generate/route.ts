import { NextResponse } from "next/server";

export const runtime = "nodejs";

type GenerateBody = {
  prompt: string;
  width?: number;
  height?: number;
  steps?: number;
  seed?: number;
  guidance?: number;
};

function makeJobId() {
  // no external deps
  return `${crypto.randomUUID()}-u1`;
}

export async function POST(req: Request) {
  let body: GenerateBody;

  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.prompt || typeof body.prompt !== "string") {
    return NextResponse.json({ ok: false, error: "Missing prompt" }, { status: 400 });
  }

  const jobId = makeJobId();

  // These must already exist in Vercel env vars (Project → Settings → Environment Variables)
  const RUNPOD_GENERATE_URL = process.env.RUNPOD_GENERATE_URL;
  const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;

  if (!RUNPOD_GENERATE_URL || !RUNPOD_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "Server not configured (missing RUNPOD_GENERATE_URL or RUNPOD_API_KEY)" },
      { status: 500 }
    );
  }

  // Fire the worker request. We expect the worker to accept jobId and later expose status by jobId.
  let upstreamText = "";
  try {
    const r = await fetch(RUNPOD_GENERATE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RUNPOD_API_KEY}`,
      },
      body: JSON.stringify({ jobId, ...body }),
    });

    upstreamText = await r.text();

    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: "Upstream generate failed", upstream_status: r.status, upstream: upstreamText },
        { status: 502 }
      );
    }
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Upstream request failed" },
      { status: 502 }
    );
  }

  // Return jobId immediately (client polls /api/status?jobId=...)
  return NextResponse.json({ ok: true, jobId });
}
