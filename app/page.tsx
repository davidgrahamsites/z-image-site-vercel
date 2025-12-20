"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

type GenerateResponse =
  | { ok: true; jobId: string }
  | { ok: false; error: string };

type StatusResponse =
  | { ok: true; status: "QUEUED" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED"; output?: { image_b64?: string }; error?: string }
  | { ok: false; error: string };

type HistoryItem = {
  id: string;
  createdAt: number;
  prompt: string;
  negativePrompt: string;
  imageDataUrl?: string;
  status: "QUEUED" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED";
  error?: string;
  params: UiParams;
};

type UiParams = {
  aspect: "1:1" | "4:3" | "3:4" | "16:9" | "9:16";
  steps: number;
  guidance: number;
  seed: number | "";
  numImages: 1;
  format: "png";
};

const DEFAULT_PARAMS: UiParams = {
  aspect: "1:1",
  steps: 30,
  guidance: 7,
  seed: "",
  numImages: 1,
  format: "png",
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeJsonStringify(v: any) {
  try {
    return JSON.stringify(v);
  } catch {
    return "{}";
  }
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}

export default function Page() {
  const [prompt, setPrompt] = useState<string>("");
  const [negativePrompt, setNegativePrompt] = useState<string>("");

  const [params, setParams] = useState<UiParams>(DEFAULT_PARAMS);
  const normalizedParams = useMemo(() => {
    return {
      ...params,
      steps: clamp(Number(params.steps || 30), 10, 80),
      guidance: clamp(Number(params.guidance || 7), 1, 20),
      seed: params.seed === "" ? "" : clamp(Number(params.seed), 0, 2_147_483_647),
    } as UiParams;
  }, [params]);

  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<"IDLE" | "QUEUED" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED">("IDLE");
  const [error, setError] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);

  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  const [history, setHistory] = useState<HistoryItem[]>([]);

  const pollTimerRef = useRef<number | null>(null);
  const startTsRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const canGenerate = useMemo(() => {
    const busy = status === "QUEUED" || status === "IN_PROGRESS";
    return !busy && prompt.trim().length > 0;
  }, [status, prompt]);

  const busy = status === "QUEUED" || status === "IN_PROGRESS";

  const clearPoll = useCallback(() => {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const resetJobState = useCallback(() => {
    clearPoll();
    abortRef.current?.abort();
    abortRef.current = null;

    setJobId(null);
    setStatus("IDLE");
    setError(null);
    setImageDataUrl(null);
    setElapsedMs(0);
    startTsRef.current = null;
  }, [clearPoll]);

  useEffect(() => {
    if (!busy) return;
    if (!startTsRef.current) return;

    const t = window.setInterval(() => {
      setElapsedMs(Date.now() - (startTsRef.current || Date.now()));
    }, 250);

    return () => window.clearInterval(t);
  }, [busy]);

  const pushHistory = useCallback((item: HistoryItem) => {
    setHistory((prev) => [item, ...prev].slice(0, 12));
  }, []);

  const updateHistoryItem = useCallback((id: string, patch: Partial<HistoryItem>) => {
    setHistory((prev) => prev.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  }, []);

  const pollStatus = useCallback(
    async (jid: string, historyId: string) => {
      const controller = abortRef.current;
      const res = await fetch(`/api/status?jobId=${encodeURIComponent(jid)}`, {
        method: "GET",
        signal: controller?.signal,
        cache: "no-store",
      });

      const data = (await res.json()) as StatusResponse;

      if (!data || data.ok === false) {
        const msg = (data as any)?.error || `Status request failed (${res.status})`;
        setStatus("FAILED");
        setError(msg);
        updateHistoryItem(historyId, { status: "FAILED", error: msg });
        clearPoll();
        return;
      }

      const s = data.status;
      if (s === "QUEUED" || s === "IN_PROGRESS") {
        setStatus(s);
        updateHistoryItem(historyId, { status: s });
        return;
      }

      if (s === "COMPLETED") {
        const b64 = data.output?.image_b64;
        if (!b64) {
          const msg = "COMPLETED but no image_b64 in output";
          setStatus("FAILED");
          setError(msg);
          updateHistoryItem(historyId, { status: "FAILED", error: msg });
          clearPoll();
          return;
        }

        const url = `data:image/png;base64,${b64}`;
        setImageDataUrl(url);
        setStatus("COMPLETED");
        setError(null);
        updateHistoryItem(historyId, { status: "COMPLETED", imageDataUrl: url });
        clearPoll();
        return;
      }

      const msg = data.error || "Generation failed";
      setStatus(s);
      setError(msg);
      updateHistoryItem(historyId, { status: s, error: msg });
      clearPoll();
    },
    [clearPoll, updateHistoryItem]
  );

  const startPolling = useCallback(
    (jid: string, historyId: string) => {
      clearPoll();

      pollStatus(jid, historyId).catch((e) => {
        const msg = e?.message || "Polling error";
        setStatus("FAILED");
        setError(msg);
        updateHistoryItem(historyId, { status: "FAILED", error: msg });
      });

      pollTimerRef.current = window.setInterval(() => {
        pollStatus(jid, historyId).catch((e) => {
          const msg = e?.message || "Polling error";
          setStatus("FAILED");
          setError(msg);
          updateHistoryItem(historyId, { status: "FAILED", error: msg });
          clearPoll();
        });
      }, 1200);
    },
    [clearPoll, pollStatus, updateHistoryItem]
  );

  const onGenerate = useCallback(async () => {
    if (!canGenerate) return;

    clearPoll();
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setError(null);
    setImageDataUrl(null);

    const localHistoryId = makeId();
    const createdAt = Date.now();

    pushHistory({
      id: localHistoryId,
      createdAt,
      prompt: prompt.trim(),
      negativePrompt: negativePrompt.trim(),
      status: "QUEUED",
      params: normalizedParams,
    });

    setStatus("QUEUED");
    startTsRef.current = Date.now();
    setElapsedMs(0);

    const payload = {
      prompt: prompt.trim(),
      negative_prompt: negativePrompt.trim(),
      params: {
        aspect: normalizedParams.aspect,
        steps: normalizedParams.steps,
        guidance: normalizedParams.guidance,
        seed: normalizedParams.seed === "" ? undefined : normalizedParams.seed,
        num_images: normalizedParams.numImages,
        format: normalizedParams.format,
      },
    };

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: safeJsonStringify(payload),
      signal: abortRef.current.signal,
    });

    const data = (await res.json()) as GenerateResponse;

    if (!data || data.ok === false) {
      const msg = (data as any)?.error || `Generate request failed (${res.status})`;
      setStatus("FAILED");
      setError(msg);
      updateHistoryItem(localHistoryId, { status: "FAILED", error: msg });
      clearPoll();
      return;
    }

    setJobId(data.jobId);
    setStatus("IN_PROGRESS");
    updateHistoryItem(localHistoryId, { status: "IN_PROGRESS" });

    startPolling(data.jobId, localHistoryId);
  }, [
    canGenerate,
    clearPoll,
    negativePrompt,
    normalizedParams,
    prompt,
    pushHistory,
    startPolling,
    updateHistoryItem,
  ]);

  const onCancel = useCallback(() => {
    if (!busy) return;
    abortRef.current?.abort();
    abortRef.current = null;
    clearPoll();
    setStatus("CANCELLED");
    setError("Cancelled locally");
  }, [busy, clearPoll]);

  const onUseHistory = useCallback((h: HistoryItem) => {
    setPrompt(h.prompt);
    setNegativePrompt(h.negativePrompt);
    setParams(h.params);
    if (h.imageDataUrl) setImageDataUrl(h.imageDataUrl);
    setError(h.error || null);
    setStatus(h.status === "COMPLETED" ? "COMPLETED" : "IDLE");
    setJobId(null);
    clearPoll();
  }, [clearPoll]);

  const onDownload = useCallback(() => {
    if (!imageDataUrl) return;
    const a = document.createElement("a");
    a.href = imageDataUrl;
    a.download = `z-image-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [imageDataUrl]);

  const onCopyImage = useCallback(async () => {
    if (!imageDataUrl) return;
    const res = await fetch(imageDataUrl);
    const blob = await res.blob();
    // @ts-ignore
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
  }, [imageDataUrl]);

  const statusLabel = useMemo(() => {
    if (status === "IDLE") return "Idle";
    if (status === "QUEUED") return "Queued";
    if (status === "IN_PROGRESS") return "Generating";
    if (status === "COMPLETED") return "Completed";
    if (status === "FAILED") return "Failed";
    if (status === "CANCELLED") return "Cancelled";
    return status;
  }, [status]);

  useEffect(() => {
    return () => {
      clearPoll();
      abortRef.current?.abort();
    };
  }, [clearPoll]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Z-Image</h1>
            <p className="mt-1 text-sm text-neutral-400">Prompt → Generate → Poll → Render</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm hover:bg-neutral-800"
              onClick={() => setShowAdvanced((v) => !v)}
              type="button"
            >
              {showAdvanced ? "Hide controls" : "Show controls"}
            </button>
            <button
              className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm hover:bg-neutral-800"
              onClick={resetJobState}
              type="button"
            >
              Reset
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm text-neutral-300">Prompt</label>
                <textarea
                  className="min-h-[120px] w-full resize-y rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-neutral-600"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe what you want to generate..."
                />
                <div className="mt-1 flex items-center justify-between text-xs text-neutral-500">
                  <span>{prompt.trim().length} chars</span>
                  <button
                    type="button"
                    className="rounded-md px-2 py-1 hover:bg-neutral-800"
                    onClick={() => setPrompt("")}
                    disabled={busy}
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Negative prompt</label>
                <input
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-neutral-600"
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder="Optional: what to avoid..."
                />
              </div>

              {showAdvanced && (
                <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-neutral-400">Aspect</label>
                      <select
                        className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-2 text-sm outline-none focus:border-neutral-600"
                        value={params.aspect}
                        onChange={(e) => setParams((p) => ({ ...p, aspect: e.target.value as UiParams["aspect"] }))}
                        disabled={busy}
                      >
                        <option value="1:1">1:1</option>
                        <option value="4:3">4:3</option>
                        <option value="3:4">3:4</option>
                        <option value="16:9">16:9</option>
                        <option value="9:16">9:16</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-neutral-400">Seed</label>
                      <input
                        className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-2 text-sm outline-none focus:border-neutral-600"
                        value={params.seed}
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          setParams((p) => ({ ...p, seed: v === "" ? "" : Number(v) }));
                        }}
                        placeholder="Random"
                        inputMode="numeric"
                        disabled={busy}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-neutral-400">Steps (10–80)</label>
                      <input
                        className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-2 text-sm outline-none focus:border-neutral-600"
                        value={params.steps}
                        onChange={(e) => setParams((p) => ({ ...p, steps: Number(e.target.value) }))}
                        inputMode="numeric"
                        disabled={busy}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-neutral-400">Guidance (1–20)</label>
                      <input
                        className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-2 text-sm outline-none focus:border-neutral-600"
                        value={params.guidance}
                        onChange={(e) => setParams((p) => ({ ...p, guidance: Number(e.target.value) }))}
                        inputMode="numeric"
                        disabled={busy}
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <button
                      type="button"
                      className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs hover:bg-neutral-800"
                      onClick={() => setParams(DEFAULT_PARAMS)}
                      disabled={busy}
                    >
                      Defaults
                    </button>
                    <div className="text-xs text-neutral-500">
                      Payload: <span className="font-mono text-neutral-400">prompt + negative_prompt + params</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  className={`rounded-xl px-4 py-2 text-sm font-medium ${
                    canGenerate ? "bg-white text-neutral-950 hover:bg-neutral-200" : "bg-neutral-800 text-neutral-500"
                  }`}
                  onClick={onGenerate}
                  disabled={!canGenerate}
                  type="button"
                >
                  Generate
                </button>

                <button
                  className={`rounded-xl border px-4 py-2 text-sm ${
                    busy ? "border-neutral-700 bg-neutral-900 hover:bg-neutral-800" : "border-neutral-900 bg-neutral-950 text-neutral-700"
                  }`}
                  onClick={onCancel}
                  disabled={!busy}
                  type="button"
                >
                  Cancel
                </button>

                <div className="ml-auto flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-300">
                  <span className="text-neutral-500">Status</span>
                  <span className="font-medium">{statusLabel}</span>
                  {busy && (
                    <>
                      <span className="text-neutral-700">•</span>
                      <span className="text-neutral-400">{formatTime(elapsedMs)}</span>
                    </>
                  )}
                </div>
              </div>

              {jobId && (
                <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-400">
                  <span className="text-neutral-500">jobId</span>{" "}
                  <span className="font-mono text-neutral-300">{jobId}</span>
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-200">
                  {error}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-neutral-200">Preview</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={`rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs hover:bg-neutral-800 ${
                    imageDataUrl ? "" : "opacity-50"
                  }`}
                  onClick={onDownload}
                  disabled={!imageDataUrl}
                >
                  Download PNG
                </button>
                <button
                  type="button"
                  className={`rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs hover:bg-neutral-800 ${
                    imageDataUrl ? "" : "opacity-50"
                  }`}
                  onClick={onCopyImage}
                  disabled={!imageDataUrl}
                >
                  Copy Image
                </button>
              </div>
            </div>

            <div className="mt-3 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950">
              <div className="relative aspect-square w-full">
                {!imageDataUrl && !busy && (
                  <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500">
                    No image yet
                  </div>
                )}

                {busy && (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-3">
                    <div className="h-10 w-10 animate-spin rounded-full border-2 border-neutral-700 border-t-neutral-200" />
                    <div className="text-sm text-neutral-300">
                      {status === "QUEUED" ? "Queued..." : "Generating..."}
                    </div>
                    <div className="text-xs text-neutral-500">{formatTime(elapsedMs)}</div>
                  </div>
                )}

                {imageDataUrl && (
                  <img
                    src={imageDataUrl}
                    alt="Generated"
                    className="h-full w-full object-contain"
                    draggable={false}
                  />
                )}
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium text-neutral-200">Recent</h3>
                <button
                  type="button"
                  className={`rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs hover:bg-neutral-800 ${
                    history.length ? "" : "opacity-50"
                  }`}
                  onClick={() => setHistory([])}
                  disabled={!history.length}
                >
                  Clear
                </button>
              </div>

              <div className="space-y-2">
                {history.length === 0 && (
                  <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-500">
                    No history yet
                  </div>
                )}

                {history.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => onUseHistory(h)}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-left hover:bg-neutral-900"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm text-neutral-200">{h.prompt}</div>
                        {h.negativePrompt && (
                          <div className="truncate text-xs text-neutral-500">Neg: {h.negativePrompt}</div>
                        )}
                      </div>
                      <div className="shrink-0 text-xs text-neutral-500">
                        {h.status}
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-xs text-neutral-500">
                      <div className="font-mono">
                        {h.params.aspect} • steps {h.params.steps} • cfg {h.params.guidance}
                        {h.params.seed !== "" ? ` • seed ${h.params.seed}` : ""}
                      </div>
                      <div>{new Date(h.createdAt).toLocaleTimeString()}</div>
                    </div>

                    {h.error && (
                      <div className="mt-2 rounded-lg border border-red-900/60 bg-red-950/30 px-2 py-1 text-xs text-red-200">
                        {h.error}
                      </div>
                    )}

                    {h.imageDataUrl && (
                      <div className="mt-2 overflow-hidden rounded-lg border border-neutral-800">
                        <img src={h.imageDataUrl} alt="thumb" className="h-24 w-full object-cover" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>

        <footer className="mt-8 text-xs text-neutral-600">
          Tip: Keep the API backward-compatible; ignore unknown fields server-side.
        </footer>
      </div>
    </div>
  );
}
