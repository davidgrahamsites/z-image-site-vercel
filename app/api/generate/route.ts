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

  // Use the env vars you already have in Vercel:
  // RUNPOD_BASE_URL, RUNPOD_ENDPOINT_ID, RUNPOD_API_KEY
  const RUNPOD_BASE_URL = process.env.RUNPOD_BASE_URL;
  const RUNPOD_ENDPOINT_ID = process.env.RUNPOD_ENDPOINT_ID;
  const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;

  if (!RUNPOD_BASE_URL || !RUNPOD_ENDPOINT_ID || !RUNPOD_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "Server not configured (missing RUNPOD_BASE_URL, RUNPOD_ENDPOINT_ID, or RUNPOD_API_KEY)" },
      { status: 500 }
    );
  }

  const RUNPOD_GENERATE_URL = `${RUNPOD_BASE_URL}/${RUNPOD_ENDPOINT_ID}/run`;


console.log("RUNPOD_GENERATE_URL =", RUNPOD_GENERATE_URL);


  try {
    const r = await fetch(RUNPOD_GENERATE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RUNPOD_API_KEY}`,
      },
      body: JSON.stringify({ jobId, ...body }),
    });

    const upstreamText = await r.text();

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

  return NextResponse.json({ ok: true, jobId });
}
