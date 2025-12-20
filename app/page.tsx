"use client";

import { useState } from "react";

export default function Home() {
  const [prompt, setPrompt] = useState("Hello World");
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [imageB64, setImageB64] = useState<string | null>(null);

  async function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function generate() {
    setJobId(null);
    setStatus("SUBMITTING");
    setImageB64(null);

    const r = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    const j = await r.json();
    if (!j?.jobId) {
      setStatus("FAILED_SUBMIT");
      return;
    }

    setJobId(j.jobId);

    while (true) {
      const s = await fetch(`/api/status?jobId=${encodeURIComponent(j.jobId)}`);
      const sj = await s.json();

      setStatus(sj?.status ?? "UNKNOWN");

      if (sj?.status === "COMPLETED") {
        const b64 = sj?.output?.image_b64 ?? null;
        if (b64) setImageB64(b64);
        break;
      }

      if (sj?.status === "FAILED" || sj?.status === "CANCELLED") break;

      await sleep(1200);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Z-Image Turbo</h1>

      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          style={{ flex: 1, padding: 10, border: "1px solid #ccc", borderRadius: 6 }}
        />
        <button
          onClick={generate}
          style={{ padding: "10px 14px", borderRadius: 6, border: "1px solid #ccc" }}
        >
          Generate
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        <div>jobId: {jobId ?? "-"}</div>
        <div>status: {status ?? "-"}</div>
      </div>

      {imageB64 ? (
        <div style={{ marginTop: 16 }}>
          <img
            src={`data:image/png;base64,${imageB64}`}
            alt="result"
            style={{ maxWidth: "100%", border: "1px solid #ddd", borderRadius: 8 }}
          />
        </div>
      ) : null}
    </main>
  );
}
