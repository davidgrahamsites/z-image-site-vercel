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
    setStatus("SUBMITTING");
    setImageB64(null);

    const r = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    const j = await r.json();
    setJobId(j.jobId);

    while (true) {
      const s = await fetch(`/api/status?jobId=${j.jobId}`);
      const sj = await s.json();
      setStatus(sj.status);

      if (sj.status === "COMPLETED") {
        setImageB64(sj.output.image_b64);
        break;
      }

      await sleep(1200);
    }
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Z-Image Turbo</h1>

      <input
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        style={{ width: "100%", padding: 8 }}
      />

      <button onClick={generate} style={{ marginTop: 8 }}>
        Generate
      </button>

      <div style={{ marginTop: 8 }}>
        <div>jobId: {jobId}</div>
        <div>status: {status}</div>
      </div>

      {imageB64 && (
        <img
          src={`data:image/png;base64,${imageB64}`}
          style={{ marginTop: 12, maxWidth: "100%" }}
        />
      )}
    </main>
  );
}
