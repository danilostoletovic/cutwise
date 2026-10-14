"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Clapperboard,
  Film,
  FolderOpen,
  Loader2,
  Plus,
  Redo2,
  Scissors,
  Send,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useEditor } from "@/lib/store";
import {
  Clip,
  Operation,
  duration,
  locate,
  resultSchema,
  describe,
} from "@/lib/timeline";
import { ingest } from "@/lib/media";
import { loadProject, saveProject } from "@/lib/persistence";
import Preview, { stamp } from "./preview";
import VideoAI from "./video-ai";
import StylePanel from "./style-panel";
import { EditingStyle, firstCut, presets } from "@/lib/styles";
import { activeSounds, soundLibrary, soundWav } from "@/lib/effects";
type Message = { role: "user" | "assistant" | "error"; text: string };
const examples = [
  "Create a fast-paced 30-second montage using my selected style",
  "Zoom in at 5 seconds",
  "Remove the sound effect at 2 seconds",
  "Remove the first 3 seconds",
  "Split at 10 seconds",
  "Mute the selected clip",
  "Delete the section from 5 to 8 seconds",
  "Move the last clip to the beginning",
];
export default function Editor() {
  const s = useEditor(),
    fileInput = useRef<HTMLInputElement>(null),
    [error, setError] = useState(""),
    [uploading, setUploading] = useState(false),
    [drag, setDrag] = useState(false),
    [prompt, setPrompt] = useState(""),
    [messages, setMessages] = useState<Message[]>([]),
    [thinking, setThinking] = useState(false),
    [code, setCode] = useState(""),
    [save, setSave] = useState("Loading local project…"),
    [ready, setReady] = useState(false),
    [canSave, setCanSave] = useState(true),
    [exporting, setExporting] = useState(false),
    [exportProgress, setExportProgress] = useState(0),
    [exportLabel, setExportLabel] = useState(""),
    [download, setDownload] = useState(""),
    abort = useRef<AbortController | null>(null),
    [zoom, setZoom] = useState(50);
  const [tool, setTool] = useState("Media"),
    [style, setStyle] = useState<EditingStyle>(presets[0]),
    [targetLength, setTargetLength] = useState(30),
    [search, setSearch] = useState(""),
    [collapsed, setCollapsed] = useState(false),
    [feedback, setFeedback] = useState<{
      text: string;
      operations: Operation[];
    } | null>(null);
  const audition = useRef<HTMLAudioElement | null>(null);
  const total = duration(s.clips),
    selected = s.clips.find((c) => c.id === s.selected),
    index = s.clips.findIndex((c) => c.id === s.selected),
    selectedAsset = s.assets.find((a) => a.id === selected?.assetId);
  const width = Math.max(700, total * zoom);
  useEffect(() => {
    let cancelled = false;
    loadProject()
      .then((p) => {
        if (cancelled) return;
        if (p)
          useEditor.getState().set({
            ...p,
            selected: p.clips[0]?.id ?? null,
            status: "Restored local project",
          });
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setSave("Could not restore local project");
          setCanSave(false);
          setError(
            "Local project could not be restored. Automatic saving is paused to protect the stored project. Keep this tab open and retry by reloading.",
          );
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!ready || !canSave) return;
    setSave("Saving locally…");
    const timer = setTimeout(() => {
      saveProject(s.name, s.clips, s.assets, s.ratio)
        .then(() => setSave("Saved on this device"))
        .catch(() =>
          setSave("Storage full or unavailable — keep this tab open"),
        );
    }, 500);
    return () => clearTimeout(timer);
  }, [s.name, s.clips, s.assets, s.ratio, ready, canSave]);
  useEffect(
    () => () => {
      if (audition.current) {
        audition.current.pause();
        URL.revokeObjectURL(audition.current.src);
      }
    },
    [],
  );
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        (e.target as HTMLElement).matches(
          "input,textarea,select,button,a,[contenteditable=true]",
        )
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) useEditor.getState().redo();
        else useEditor.getState().undo();
      }
      if (e.code === "Space") {
        e.preventDefault();
        const state = useEditor.getState(),
          d = duration(state.clips);
        if (d)
          state.set({
            playing: !state.playing,
            time: state.time >= d ? 0 : state.time,
          });
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(
    () => () => {
      if (download) URL.revokeObjectURL(download);
    },
    [download],
  );
  function edit(ops: Operation[]) {
    try {
      s.edit(ops);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Edit failed.");
    }
  }
  async function upload(files: FileList | File[]) {
    setUploading(true);
    setError("");
    const errors: string[] = [];
    for (const file of Array.from(files)) {
      s.set({
        status: `Reading ${file.name} (${Array.from(files).indexOf(file) + 1}/${files.length})`,
      });
      try {
        const asset = await ingest(file);
        const state = useEditor.getState();
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
          `Added ${asset.name}`,
        );
      } catch (e) {
        errors.push(e instanceof Error ? e.message : "Upload failed.");
      }
    }
    setError(errors.join(" "));
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
  }
  function split() {
    const at = locate(s.clips, s.time);
    if (at)
      edit([
        { type: "split_clip", clipId: at.clip.id, seconds: s.time - at.offset },
      ]);
  }
  function trim(c: Clip, edge: "start" | "end", value: number) {
    try {
      const next = {
        ...c,
        [edge === "start" ? "sourceStart" : "sourceEnd"]: value,
      };
      if (value < 0 || value > (selectedAsset?.duration ?? 0))
        throw new Error("Trim is outside the source video.");
      s.commit(
        s.clips.map((x) => (x.id === c.id ? next : x)),
        `Trimmed clip ${edge}`,
      );
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid trim.");
    }
  }
  function dragTrim(
    e: React.PointerEvent<HTMLButtonElement>,
    c: Clip,
    edge: "start" | "end",
  ) {
    e.stopPropagation();
    const start = e.clientX,
      original = edge === "start" ? c.sourceStart : c.sourceEnd,
      asset = s.assets.find((a) => a.id === c.assetId);
    let end = start;
    e.currentTarget.setPointerCapture(e.pointerId);
    const node = e.currentTarget;
    function move(ev: PointerEvent) {
      end = ev.clientX;
      node.style.transform = `translateX(${end - start}px)`;
    }
    function up() {
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", cancel);
      node.style.transform = "";
      const value = Math.max(
        edge === "start" ? 0 : c.sourceStart + 0.05,
        Math.min(
          edge === "start"
            ? c.sourceEnd - 0.05
            : (asset?.duration ?? c.sourceEnd),
          original + (end - start) / zoom,
        ),
      );
      if (Math.abs(value - original) > 0.001) {
        try {
          useEditor.getState().commit(
            useEditor.getState().clips.map((x) =>
              x.id === c.id
                ? {
                    ...x,
                    [edge === "start" ? "sourceStart" : "sourceEnd"]: value,
                  }
                : x,
            ),
            `Trimmed ${edge}`,
          );
        } catch (err) {
          setError(String(err));
        }
      }
    }
    function cancel() {
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", cancel);
      node.style.transform = "";
    }
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up);
    node.addEventListener("pointercancel", cancel);
  }
  async function ask() {
    if (!prompt.trim() || thinking || !s.clips.length) return;
    const text = prompt.trim(),
      revision = s.revision;
    setMessages((m) => [...m, { role: "user", text }]);
    setPrompt("");
    setThinking(true);
    try {
      const response = await fetch("/api/ai/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-demo-code": code },
        body: JSON.stringify({
          prompt: text,
          revision,
          clips: s.clips,
          selectedClipId: s.selected,
          playheadTime: s.time,
          timelineDuration: total,
          style,
          media: s.assets.map((a) => ({
            id: a.id,
            name: a.name,
            duration: a.duration,
            width: a.width,
            height: a.height,
          })),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "AI request failed.");
      const result = resultSchema.parse(body);
      if (result.clarification) {
        setMessages((m) => [
          ...m,
          { role: "assistant", text: result.clarification! },
        ]);
      } else {
        useEditor.getState().edit(result.operations, revision);
        setFeedback({ text, operations: result.operations });
        setMessages((m) => [
          ...m,
          { role: "assistant", text: describe(result.operations) },
        ]);
      }
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          role: "error",
          text:
            e instanceof Error
              ? e.message
              : "AI unavailable. Try a manual edit.",
        },
      ]);
    } finally {
      setThinking(false);
    }
  }
  async function runExport() {
    setExporting(true);
    setError("");
    setDownload("");
    setExportProgress(0);
    s.set({ playing: false });
    abort.current = new AbortController();
    try {
      const { renderVideo } = await import("@/lib/export");
      const blob = await renderVideo(
        s.clips,
        s.assets,
        (p, label) => {
          setExportProgress(p);
          setExportLabel(label);
        },
        abort.current.signal,
        s.ratio,
      );
      setDownload(URL.createObjectURL(blob));
    } catch (e) {
      setError(
        abort.current?.signal.aborted
          ? "Export cancelled."
          : e instanceof Error
            ? e.message
            : "Export failed.",
      );
    } finally {
      setExporting(false);
    }
  }
  return (
    <main
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (ready && !uploading) void upload(e.dataTransfer.files);
      }}
    >
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">
            <Clapperboard size={19} />
          </span>
          shorties<span className="alpha">ALPHA</span>
        </div>
        <div className="project-title">
          <ChevronRight size={14} />
          <input
            aria-label="Project title"
            maxLength={80}
            value={s.name}
            onChange={(e) => s.set({ name: e.target.value })}
          />
        </div>
        <div className="header-actions">
          <span className="save-state">
            <Check size={12} />
            {save}
          </span>
          <button
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            disabled={!s.past.length}
            onClick={s.undo}
          >
            <Undo2 size={16} />
          </button>
          <button
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
            disabled={!s.future.length}
            onClick={s.redo}
          >
            <Redo2 size={16} />
          </button>
          <button
            className="primary"
            disabled={!s.clips.length || exporting}
            onClick={() => void runExport()}
          >
            {exporting ? (
              <Loader2 className="spin" size={15} />
            ) : (
              <ArrowDownToLine size={15} />
            )}
            Export MP4
          </button>
        </div>
      </header>
      {error && (
        <div className="error global-error" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={14} />
          </button>
        </div>
      )}
      {exporting && (
        <div className="export-progress" role="status">
          <Loader2 size={15} className="spin" />
          <span>
            {exportLabel} · {Math.round(exportProgress)}%
          </span>
          <progress max={100} value={exportProgress} />
          <button onClick={() => abort.current?.abort()}>Cancel</button>
        </div>
      )}
      {download && (
        <div className="export-progress success">
          <Check size={16} />
          <span>Validated MP4 ready · {s.ratio}</span>
          <a
            className="primary"
            href={download}
            download={`${s.name.replace(/[^a-z0-9 _-]/gi, "") || "shorties"}.mp4`}
          >
            Download video
          </a>
          <button
            aria-label="Close export result"
            onClick={() => setDownload("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <input
        ref={fileInput}
        data-testid="file-input"
        className="sr-only"
        type="file"
        accept="video/mp4,video/webm,video/quicktime,.m4v"
        multiple
        disabled={!ready || uploading}
        onChange={(e) => {
          if (e.target.files) void upload(e.target.files);
        }}
      />
      <div className={`workspace ${collapsed ? "assistant-collapsed" : ""}`}>
        <aside className="media panel">
          <div className="panel-heading">
            <span>
              <FolderOpen size={15} /> Media library
            </span>
            <span className="quiet">{s.assets.length}</span>
          </div>
          <nav className="tool-tabs" aria-label="Editing tools">
            {["Media", "Styles", "Sounds", "Transitions", "Titles"].map((t) => (
              <button
                key={t}
                className={tool === t ? "active" : ""}
                aria-pressed={tool === t}
                onClick={() => {
                  setTool(t);
                  setSearch("");
                }}
              >
                {t}
              </button>
            ))}
          </nav>
          {tool === "Styles" ? (
            <StylePanel
              style={style}
              onChange={setStyle}
              target={targetLength}
              setTarget={setTargetLength}
              disabled={!s.clips.length || !ready}
              feedback={feedback}
              onAssemble={() => {
                try {
                  s.commit(
                    firstCut(s.clips, style, targetLength),
                    `Assembled ${style.name} · metadata-based pacing`,
                    style.ratio,
                  );
                  setError("");
                } catch (e) {
                  setError(String(e));
                }
              }}
            />
          ) : tool === "Sounds" ? (
            <div className="tool-content">
              <h3>Sound punctuation</h3>
              <p className="quiet">
                Original synthesized sounds. Place at the playhead; no downloads
                or licensing required.
              </p>
              <input
                aria-label="Search sounds"
                placeholder="Search sounds…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {soundLibrary
                .filter((x) =>
                  (x.name + " " + x.description)
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((x) => (
                  <div className="sound-card" key={x.kind}>
                    <strong>{x.name}</strong>
                    <p>{x.description}</p>
                    <button
                      onClick={() => {
                        if (audition.current) {
                          audition.current.pause();
                          URL.revokeObjectURL(audition.current.src);
                        }
                        const url = URL.createObjectURL(
                          new Blob([soundWav(x.kind).buffer as ArrayBuffer], {
                            type: "audio/wav",
                          }),
                        );
                        audition.current = new Audio(url);
                        void audition.current
                          .play()
                          .catch(() =>
                            setError("Sound audition could not play."),
                          );
                      }}
                    >
                      Listen
                    </button>
                    <button
                      disabled={!total || s.time >= total}
                      onClick={() =>
                        edit([
                          {
                            type: "sound_at",
                            time: s.time,
                            kind: x.kind,
                            volume: style.soundIntensity || 0.5,
                          },
                        ])
                      }
                    >
                      Add at {stamp(s.time)}
                    </button>
                  </div>
                ))}
            </div>
          ) : tool === "Transitions" ? (
            <div className="tool-content">
              <h3>Between the moments</h3>
              <p className="quiet">
                Apply to the selected clip. Fades go through black and preserve
                sequence timing.
              </p>
              {["cut", "fade"].map((kind) => (
                <button
                  className="effect-card"
                  key={kind}
                  disabled={!selected}
                  onClick={() =>
                    selected &&
                    edit([
                      {
                        type: "set_transition",
                        clipId: selected.id,
                        kind: kind as "cut" | "fade",
                        duration: kind === "fade" ? 0.3 : 0,
                      },
                    ])
                  }
                >
                  <strong>
                    {kind === "cut" ? "Hard cut" : "Fade through black"}
                  </strong>
                  <span>
                    {kind === "cut"
                      ? "Immediate, clean handoff"
                      : "A softer entrance and exit · 0.3s"}
                  </span>
                </button>
              ))}
              <small>
                Crossfade and slide are not supported by this renderer yet.
              </small>
            </div>
          ) : tool === "Titles" ? (
            <div className="tool-content">
              <h3>A little emphasis</h3>
              <p className="quiet">
                Deterministic lower third and zoom, rendered into your MP4.
              </p>
              <label>
                Selected clip title
                <input
                  aria-label="Clip title"
                  key={`${selected?.id}-${selected?.title}`}
                  maxLength={80}
                  disabled={!selected}
                  defaultValue={selected?.title ?? ""}
                  onBlur={(e) =>
                    selected &&
                    edit([
                      {
                        type: "set_title",
                        clipId: selected.id,
                        text: e.target.value,
                      },
                    ])
                  }
                />
              </label>
              <button
                className="effect-card"
                disabled={!total || s.time >= total}
                onClick={() =>
                  edit([{ type: "zoom_at", time: s.time, value: 1.2 }])
                }
              >
                Zoom 1.2× from playhead
              </button>
              <button
                disabled={!selected}
                onClick={() =>
                  selected &&
                  edit([{ type: "set_title", clipId: selected.id, text: "" }])
                }
              >
                Remove title
              </button>
            </div>
          ) : (
            <>
              <button
                className="upload-zone"
                disabled={!ready || uploading}
                onClick={() => fileInput.current?.click()}
              >
                {uploading ? (
                  <Loader2 size={24} className="spin" />
                ) : (
                  <Upload size={24} />
                )}
                <strong>
                  {uploading
                    ? "Reading your footage…"
                    : "Drop your footage here"}
                </strong>
                <span>or click to browse files</span>
                <small>MP4, WebM · up to 500 MB</small>
              </button>
              <VideoAI ready={ready} />
              <input
                className="media-search"
                aria-label="Search media"
                placeholder="Search footage…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="media-list">
                {s.assets.length === 0 ? (
                  <div className="library-empty">
                    <Film size={20} />
                    <p>Room for your raw material.</p>
                    <span>Import a video to get started.</span>
                  </div>
                ) : (
                  s.assets
                    .filter((a) =>
                      a.name.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((a) => (
                      <div className="asset" key={a.id}>
                        {a.thumbnail ? (
                          <img src={a.thumbnail} alt="" />
                        ) : (
                          <Film size={20} />
                        )}
                        <div>
                          <strong title={a.name}>{a.name}</strong>
                          <span>
                            {stamp(a.duration)} ·{" "}
                            {(a.file.size / 1024 / 1024).toFixed(1)} MB
                          </span>
                          <small>
                            {a.width ? `${a.width} × ${a.height} · ` : ""}
                            Metadata extracted
                          </small>
                        </div>
                        <button
                          aria-label={`Add ${a.name} to timeline`}
                          title="Add to timeline"
                          onClick={() =>
                            s.commit(
                              [
                                ...s.clips,
                                {
                                  id: crypto.randomUUID(),
                                  assetId: a.id,
                                  sourceStart: 0,
                                  sourceEnd: a.duration,
                                  volume: 1,
                                },
                              ],
                              `Added ${a.name}`,
                            )
                          }
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    ))
                )}
              </div>
            </>
          )}
          <div className="media-note">
            <span className="dot" />
            Local-first editing
            <p>
              Original files stay untouched.
              <br />
              Project and footage save on this device.
            </p>
          </div>
        </aside>
        <Preview />
        <aside className="assistant panel">
          <div className="panel-heading">
            <span>
              <Sparkles size={15} /> AI assistant
            </span>
            <button
              aria-label={collapsed ? "Expand assistant" : "Collapse assistant"}
              onClick={() => setCollapsed(!collapsed)}
            >
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="chat">
            <div className="assistant-intro">
              <span className="assistant-icon">
                <Sparkles size={22} />
              </span>
              <h2>Your creative copilot.</h2>
              <p>
                Build a first edit or refine a moment. Your instructions become
                validated timeline changes.
              </p>
              <small>Metadata only · no visual or speech analysis</small>
              <div className="active-style">
                <span>EDITING STYLE</span>
                <strong>{style.name}</strong>
                <button onClick={() => setTool("Styles")}>Configure</button>
              </div>
            </div>
            {messages.length === 0 ? (
              <div className="suggestions">
                <span className="eyebrow">TRY A COMMAND</span>
                {examples.map((text) => (
                  <button key={text} onClick={() => setPrompt(text)}>
                    {text}
                    <ChevronRight size={13} />
                  </button>
                ))}
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`message ${m.role}`}>
                  <span>
                    {m.role === "user"
                      ? "YOU"
                      : m.role === "error"
                        ? "REQUEST FAILED"
                        : "SHORTIES"}
                  </span>
                  <p>{m.text}</p>
                </div>
              ))
            )}
            {thinking && (
              <div className="thinking">
                <Loader2 className="spin" size={14} />
                Planning timeline changes…
              </div>
            )}
          </div>
          <details className="history">
            <summary>Edit history · {s.past.length}</summary>
            <p>{s.status}</p>
            {s.past
              .slice(-8)
              .reverse()
              .map((h, i) => (
                <p key={i}>{h.summary}</p>
              ))}
          </details>
          <div className="composer">
            <textarea
              aria-label="Editing command"
              placeholder="Describe your edit…"
              value={prompt}
              maxLength={2000}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void ask();
                }
              }}
            />
            <div>
              <span className="quiet">
                Enter to apply · Shift+Enter for a new line
              </span>
              <button
                aria-label="Apply AI edit"
                className="send"
                disabled={!s.clips.length || !prompt.trim() || thinking}
                onClick={() => void ask()}
              >
                {thinking ? (
                  <Loader2 className="spin" size={16} />
                ) : (
                  <Send size={16} />
                )}
              </button>
            </div>
          </div>
          <details className="access">
            <summary>Private demo access</summary>
            <input
              type="password"
              aria-label="Demo access code"
              placeholder="Demo access code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <small>
              Required when AI is enabled on the public demo. Footage is never
              sent to AI.
            </small>
          </details>
        </aside>
        <section className="timeline panel">
          <div className="panel-heading">
            <span>
              <Scissors size={15} /> Timeline{" "}
              <span className="quiet">
                {s.clips.length} clips · {stamp(total)}
              </span>
            </span>
            <div className="timeline-actions">
              <button disabled={!total} onClick={split}>
                <Scissors size={14} />
                Split at playhead
              </button>
              <button
                aria-label="Delete selected clip"
                disabled={!selected}
                onClick={() =>
                  selected &&
                  edit([{ type: "delete_clip", clipId: selected.id }])
                }
              >
                <Trash2 size={14} />
              </button>
              <button
                aria-label="Move selected clip left"
                disabled={!selected || index === 0}
                onClick={() =>
                  selected &&
                  edit([
                    {
                      type: "move_clip",
                      clipId: selected.id,
                      index: index - 1,
                    },
                  ])
                }
              >
                <ArrowLeft size={14} />
              </button>
              <button
                aria-label="Move selected clip right"
                disabled={!selected || index === s.clips.length - 1}
                onClick={() =>
                  selected &&
                  edit([
                    {
                      type: "move_clip",
                      clipId: selected.id,
                      index: index + 1,
                    },
                  ])
                }
              >
                <ArrowRight size={14} />
              </button>
              <label className="zoom">
                Zoom
                <input
                  aria-label="Timeline zoom"
                  type="range"
                  min={10}
                  max={120}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                />
              </label>
            </div>
          </div>
          <div className="timeline-scroll">
            <div className="track-label">
              V1 <Film size={13} />
              <span>VIDEO</span>
            </div>
            <div className="track-area" style={{ width }}>
              <div
                className="ruler"
                onClick={(e) => {
                  const box = e.currentTarget.getBoundingClientRect();
                  s.set({
                    time: Math.max(
                      0,
                      Math.min(total, (e.clientX - box.left) / zoom),
                    ),
                    playing: false,
                  });
                }}
              >
                {Array.from(
                  { length: Math.ceil(width / (zoom * 5)) + 1 },
                  (_, i) => (
                    <span key={i} style={{ left: i * zoom * 5 }}>
                      {stamp(i * 5)}
                    </span>
                  ),
                )}
              </div>
              <div className="clips">
                {s.clips.length === 0 ? (
                  <button
                    className="empty-track"
                    onClick={() => fileInput.current?.click()}
                    disabled={!ready}
                  >
                    <Plus size={15} />
                    Import footage to start your sequence
                  </button>
                ) : (
                  s.clips.map((c, i) => {
                    const a = s.assets.find((a) => a.id === c.assetId);
                    return (
                      <div
                        key={c.id}
                        data-testid="timeline-clip"
                        data-source-start={c.sourceStart}
                        data-source-end={c.sourceEnd}
                        data-volume={c.volume}
                        className={`clip ${s.selected === c.id ? "selected" : ""}`}
                        style={{ width: (c.sourceEnd - c.sourceStart) * zoom }}
                      >
                        <button
                          className="trim-handle start"
                          aria-label={`Drag clip ${i + 1} start trim`}
                          onPointerDown={(e) => dragTrim(e, c, "start")}
                        />
                        <button
                          className="clip-select"
                          aria-label={`Select clip ${i + 1}`}
                          onClick={() =>
                            s.set({
                              selected: c.id,
                              time: s.clips
                                .slice(0, i)
                                .reduce(
                                  (n, c) => n + c.sourceEnd - c.sourceStart,
                                  0,
                                ),
                              playing: false,
                            })
                          }
                          style={
                            a?.thumbnail
                              ? {
                                  backgroundImage: `linear-gradient(0deg,rgba(10,14,20,.9),rgba(10,14,20,.35)),url(${a.thumbnail})`,
                                }
                              : undefined
                          }
                        >
                          <span>{a?.name ?? "Missing media"}</span>
                          <small>
                            {stamp(c.sourceEnd - c.sourceStart)}{" "}
                            {c.transition?.kind === "fade" && (
                              <span className="transition-marker">
                                FADE {c.transition.duration}s
                              </span>
                            )}
                            {c.zoom && c.zoom.value > 1 && (
                              <span>{c.zoom.value}×</span>
                            )}
                            {c.volume === 0 ? (
                              <VolumeX size={12} />
                            ) : (
                              <Volume2 size={12} />
                            )}
                          </small>
                        </button>
                        <button
                          className="trim-handle end"
                          aria-label={`Drag clip ${i + 1} end trim`}
                          onPointerDown={(e) => dragTrim(e, c, "end")}
                        />
                      </div>
                    );
                  })
                )}
              </div>
              <div className="audio-track" aria-label="Sound effects track">
                <span className="audio-track-label">SFX</span>
                {s.clips.flatMap((c, i) => {
                  const offset = s.clips
                    .slice(0, i)
                    .reduce((n, x) => n + x.sourceEnd - x.sourceStart, 0);
                  return activeSounds(c).map((cue) => (
                    <button
                      key={`${c.id}:${cue.id}`}
                      aria-label={`Remove ${cue.kind} at ${(offset + cue.sourceTime - c.sourceStart).toFixed(2)} seconds`}
                      style={{
                        left: (offset + cue.sourceTime - c.sourceStart) * zoom,
                        width: Math.max(24, zoom * 0.3),
                      }}
                      onClick={() =>
                        edit([
                          {
                            type: "remove_sound_at",
                            time: offset + cue.sourceTime - c.sourceStart,
                          },
                        ])
                      }
                      title="Click to remove sound effect"
                    >
                      {cue.kind}
                    </button>
                  ));
                })}
              </div>
              <div className="playhead" style={{ left: s.time * zoom }}>
                <span />
              </div>
            </div>
          </div>
          <div className="inspector">
            {selected ? (
              <>
                <span className="quiet">Selected clip</span>
                <label>
                  In{" "}
                  <input
                    key={`${selected.id}-start-${selected.sourceStart}`}
                    aria-label="Clip source start"
                    type="number"
                    min={0}
                    max={selected.sourceEnd - 0.05}
                    step="0.1"
                    defaultValue={selected.sourceStart}
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (n !== selected.sourceStart)
                        trim(selected, "start", n);
                    }}
                  />
                </label>
                <label>
                  Out{" "}
                  <input
                    key={`${selected.id}-end-${selected.sourceEnd}`}
                    aria-label="Clip source end"
                    type="number"
                    min={selected.sourceStart + 0.05}
                    max={selectedAsset?.duration}
                    step="0.1"
                    defaultValue={selected.sourceEnd}
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (n !== selected.sourceEnd) trim(selected, "end", n);
                    }}
                  />
                </label>
                <button
                  aria-label={
                    selected.volume === 0
                      ? "Unmute selected clip"
                      : "Mute selected clip"
                  }
                  onClick={() =>
                    edit([
                      {
                        type: "set_volume",
                        clipId: selected.id,
                        value: selected.volume === 0 ? 1 : 0,
                      },
                    ])
                  }
                >
                  {selected.volume === 0 ? (
                    <VolumeX size={14} />
                  ) : (
                    <Volume2 size={14} />
                  )}
                </button>
                <label>
                  Volume{" "}
                  <input
                    key={`${selected.id}-volume-${selected.volume}`}
                    aria-label="Clip volume"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    defaultValue={selected.volume}
                    onPointerUp={(e) =>
                      edit([
                        {
                          type: "set_volume",
                          clipId: selected.id,
                          value: Number(e.currentTarget.value),
                        },
                      ])
                    }
                    onKeyUp={(e) => {
                      if (
                        e.key.startsWith("Arrow") ||
                        e.key === "Home" ||
                        e.key === "End"
                      )
                        edit([
                          {
                            type: "set_volume",
                            clipId: selected.id,
                            value: Number(e.currentTarget.value),
                          },
                        ]);
                    }}
                  />
                  <span>{Math.round(selected.volume * 100)}%</span>
                </label>
              </>
            ) : (
              <span className="quiet">
                Select a clip to trim or adjust its audio.
              </span>
            )}
            <span className="revision">REV {s.revision}</span>
          </div>
          {selected && (
            <div className="effect-properties">
              <label>
                Transition
                <select
                  aria-label="Clip transition"
                  value={selected.transition?.kind ?? "cut"}
                  onChange={(e) =>
                    edit([
                      {
                        type: "set_transition",
                        clipId: selected.id,
                        kind: e.target.value as "cut" | "fade",
                        duration: selected.transition?.duration || 0.3,
                      },
                    ])
                  }
                >
                  <option value="cut">Hard cut</option>
                  <option value="fade">Fade</option>
                </select>
              </label>
              {selected.transition?.kind === "fade" && (
                <label>
                  Seconds
                  <input
                    aria-label="Transition duration"
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={selected.transition.duration}
                    onChange={(e) =>
                      edit([
                        {
                          type: "set_transition",
                          clipId: selected.id,
                          kind: "fade",
                          duration: Number(e.target.value),
                        },
                      ])
                    }
                  />
                </label>
              )}
              <label>
                Zoom
                <input
                  aria-label="Clip zoom"
                  type="number"
                  min={1}
                  max={2}
                  step={0.05}
                  value={selected.zoom?.value ?? 1}
                  onChange={(e) =>
                    edit([
                      {
                        type: "zoom_at",
                        time: s.clips
                          .slice(0, index)
                          .reduce((n, c) => n + c.sourceEnd - c.sourceStart, 0),
                        value: Number(e.target.value),
                      },
                    ])
                  }
                />
              </label>
              {activeSounds(selected).map((cue) => (
                <label key={cue.id}>
                  {cue.kind} volume
                  <input
                    aria-label={`${cue.kind} volume`}
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={cue.volume}
                    onChange={(e) =>
                      s.commit(
                        s.clips.map((c) =>
                          c.id === selected.id
                            ? {
                                ...c,
                                sounds: c.sounds?.map((x) =>
                                  x.id === cue.id
                                    ? { ...x, volume: Number(e.target.value) }
                                    : x,
                                ),
                              }
                            : c,
                        ),
                        "Adjusted sound effect volume",
                      )
                    }
                  />
                </label>
              ))}
            </div>
          )}
        </section>
      </div>
      <footer>
        <span>
          <span className="dot" />
          {s.status}
        </span>
        <span>Space to play · Ctrl+Z to undo · Shorties alpha</span>
      </footer>
      {drag && (
        <div className="drop-overlay">
          <Upload size={38} />
          <h2>Drop footage into your workspace</h2>
          <p>MP4 or WebM · Your files stay on this device</p>
        </div>
      )}
    </main>
  );
}
