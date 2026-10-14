"use client";
import { useEffect, useRef, useState } from "react";
import { useEditor } from "@/lib/store";
import { ingest } from "@/lib/media";
import { estimateCredits, VideoJob } from "@/lib/video-ai/types";

type Provider = { id: string; name: string; enabled: boolean; reason: string };
export default function VideoAI({ ready }: { ready: boolean }) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [provider, setProvider] = useState("runway");
  const [model, setModel] = useState<"gen4.5" | "gen4_turbo">("gen4.5");
  const [prompt, setPrompt] = useState("");
  const [image, setImage] = useState("");
  const [seconds, setSeconds] = useState(5);
  const [ratio, setRatio] = useState("720:1280");
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [provenance, setProvenance] = useState<Record<string, unknown>>({});
  const [job, setJob] = useState<VideoJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState(false);
  const [message, setMessage] = useState("");
  const [importing, setImporting] = useState<string | null>(null);
  const [imported, setImported] = useState<string[]>([]);
  const lock = useRef(false);
  const active = providers.find((p) => p.id === provider);
  useEffect(() => {
    fetch("/api/video-ai")
      .then((r) => r.json())
      .then((data) => setProviders(data.providers))
      .catch(() => setMessage("Could not read provider configuration."));
    setToken(sessionStorage.getItem("shorties-video-job") ?? "");
    try {
      setProvenance(
        JSON.parse(sessionStorage.getItem("shorties-video-input") ?? "{}"),
      );
    } catch {}
  }, []);
  async function request(url: string, body?: object) {
    const response = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", "x-demo-code": code },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Provider request failed.");
    return data;
  }
  useEffect(() => {
    if (!polling || !token) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + 20 * 60000;
    async function poll() {
      try {
        const next: VideoJob = await request(
          `/api/video-ai?job=${encodeURIComponent(token)}`,
        );
        if (cancelled) return;
        setJob(next);
        if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(next.status)) {
          setPolling(false);
          setMessage(
            next.error ??
              (next.status === "CANCELLED" ? "Generation cancelled." : ""),
          );
        } else if (Date.now() >= deadline) {
          setPolling(false);
          setMessage(
            "Polling paused after 20 minutes. Check the same job again; do not resubmit.",
          );
        } else
          timer = setTimeout(poll, next.status === "THROTTLED" ? 15000 : 5000);
      } catch (e) {
        if (!cancelled) {
          setPolling(false);
          setMessage(
            e instanceof Error
              ? e.message
              : "Status unavailable. Check this job again.",
          );
        }
      }
    }
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // An access-code change restarts polling using the same job, never a submission.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polling, token, code]);
  async function generate() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const data = await request("/api/video-ai", {
        provider: "runway",
        model,
        prompt,
        duration: seconds,
        ratio,
        ...(image ? { image } : {}),
      });
      setToken(data.token);
      sessionStorage.setItem("shorties-video-job", data.token);
      const source = {
        model,
        prompt,
        duration: seconds,
        ratio,
        image: image || undefined,
      };
      setProvenance(source);
      sessionStorage.setItem("shorties-video-input", JSON.stringify(source));
      setJob(null);
      setImported([]);
      setPolling(true);
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Submission failed. Check Runway before retrying.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function importClip(output: VideoJob["outputs"][number]) {
    if (lock.current) return;
    lock.current = true;
    setImporting(output.id);
    setMessage("");
    try {
      const response = await fetch(output.url, {
        signal: AbortSignal.timeout(60000),
        credentials: "omit",
      });
      if (!response.ok)
        throw new Error(
          "Footage download failed. Refresh job status for a new output URL.",
        );
      const blob = await response.blob();
      if (blob.size > 500 * 1024 * 1024)
        throw new Error("Generated footage exceeds the 500 MB import limit.");
      const asset = await ingest(
        new File([blob], output.name, { type: "video/mp4" }),
      );
      asset.providerMetadata = {
        ...output.metadata,
        outputId: output.id,
        ...provenance,
      };
      const state = useEditor.getState();
      if (
        state.assets.some((a) => a.providerMetadata?.outputId === output.id)
      ) {
        URL.revokeObjectURL(asset.objectUrl);
      } else {
        state.set({ assets: [...state.assets, asset] });
        state.commit(
          [
            ...state.clips,
            {
              id: crypto.randomUUID(),
              assetId: asset.id,
              sourceStart: 0,
              sourceEnd: asset.duration,
              volume: 1,
            },
          ],
          `Imported ${asset.name}`,
        );
      }
      setImported((ids) => [...ids, output.id]);
      setMessage("Footage added to the media library and timeline.");
    } catch (e) {
      setMessage(
        `${e instanceof Error ? e.message : "Import failed."} If browser download is blocked by CORS, download the clip from Runway and upload it here.`,
      );
    } finally {
      lock.current = false;
      setImporting(null);
    }
  }
  return (
    <details className="video-ai">
      <summary>
        AI video services <span className="quiet">Optional</span>
      </summary>
      <div className="video-ai-form">
        <label>
          Provider
          <select
            aria-label="Provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            disabled={busy || polling}
          >
            <option value="runway">Runway</option>
            <option value="opusclip">OpusClip</option>
          </select>
        </label>
        <p className="quiet">
          {active?.enabled
            ? "Configured · live provider validation pending"
            : (active?.reason ?? "Reading configuration…")}
        </p>
        {provider === "runway" && (
          <>
            <label>
              Generation model
              <select
                value={model}
                disabled={busy || polling}
                onChange={(e) => setModel(e.target.value as typeof model)}
              >
                <option value="gen4.5">Gen-4.5 · text or image</option>
                <option value="gen4_turbo">Gen-4 Turbo · image required</option>
              </select>
            </label>
            <label>
              Video prompt
              <textarea
                aria-label="Video prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                maxLength={1000}
                disabled={busy || polling}
              />
            </label>
            <label>
              Public HTTPS image URL
              <input
                type="url"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                disabled={busy || polling}
                placeholder="Optional for Gen-4.5"
              />
            </label>
            <label>
              Duration (seconds)
              <input
                type="number"
                min={2}
                max={10}
                value={seconds}
                onChange={(e) => setSeconds(Number(e.target.value))}
                disabled={busy || polling}
              />
            </label>
            <label>
              Video format
              <select
                value={ratio}
                onChange={(e) => setRatio(e.target.value)}
                disabled={busy || polling}
              >
                <option value="720:1280">Portrait</option>
                <option value="1280:720">Landscape</option>
              </select>
            </label>
            <p className="quiet">
              Estimated {estimateCredits(model, seconds)} credits · $
              {(estimateCredits(model, seconds) * 0.01).toFixed(2)} before tax.{" "}
              <a
                href="https://docs.dev.runwayml.com/guides/pricing/"
                target="_blank"
                rel="noreferrer"
              >
                Pricing
              </a>{" "}
              checked October 14, 2026; may change.
            </p>
            <label>
              Provider access code
              <input
                type="password"
                autoComplete="off"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            <p className="quiet">
              Generate submits to Runway and uses paid credits. An image URL
              must be accessible to Runway.
            </p>
            <button
              onClick={generate}
              disabled={
                !ready ||
                !active?.enabled ||
                busy ||
                polling ||
                !!importing ||
                !prompt.trim() ||
                !code ||
                (model === "gen4_turbo" && !image) ||
                !Number.isInteger(seconds) ||
                seconds < 2 ||
                seconds > 10
              }
            >
              {busy ? "Submitting…" : "Generate with paid credits"}
            </button>
            {token && (
              <div>
                <p role="status">
                  {job?.status ?? "Job saved"}
                  {job?.progress !== undefined
                    ? ` · ${Math.round(job.progress * 100)}%`
                    : ""}
                </p>
                {polling ? (
                  <button onClick={() => setPolling(false)}>
                    Pause status checks
                  </button>
                ) : (
                  <button
                    disabled={!code || busy || !!importing || !active?.enabled}
                    onClick={() => {
                      setMessage("");
                      setPolling(true);
                    }}
                  >
                    Check saved job
                  </button>
                )}
                <p className="quiet">
                  Pausing checks does not cancel or refund the provider job.
                </p>
              </div>
            )}
            {job?.outputs.map((output) => (
              <div key={output.id}>
                <video
                  src={output.url}
                  controls
                  preload="metadata"
                  aria-label="Generated footage preview"
                />
                <button
                  disabled={
                    !ready || !!importing || imported.includes(output.id)
                  }
                  onClick={() => importClip(output)}
                >
                  {imported.includes(output.id)
                    ? "Imported"
                    : importing === output.id
                      ? "Downloading…"
                      : "Add to library and timeline"}
                </button>
              </div>
            ))}
          </>
        )}
        {provider === "opusclip" && (
          <p className="quiet">
            Official API exists. Submission and automatic import remain
            unavailable until the account and job contract are verified. You can
            upload clips downloaded from OpusClip using the media library.
          </p>
        )}
        {message && <p role="status">{message}</p>}
      </div>
    </details>
  );
}
