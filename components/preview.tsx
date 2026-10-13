"use client";
import { useEffect, useRef, useState } from "react";
import { Pause, Play, SkipBack, SkipForward, Film } from "lucide-react";
import { useEditor } from "@/lib/store";
import { duration, locate } from "@/lib/timeline";
export function stamp(time: number) {
  return `${Math.floor(time / 60)
    .toString()
    .padStart(2, "0")}:${(time % 60).toFixed(2).padStart(5, "0")}`;
}
export default function Preview() {
  const s = useEditor(),
    v = useRef<HTMLVideoElement>(null),
    loaded = useRef(""),
    target = useRef(0),
    lastClip = useRef(""),
    syncing = useRef(false),
    [error, setError] = useState("");
  const total = duration(s.clips),
    current = locate(s.clips, s.time),
    asset = s.assets.find((a) => a.id === current?.clip.assetId);
  useEffect(() => {
    const video = v.current;
    if (!video || !current || !asset) {
      loaded.current = "";
      lastClip.current = "";
      syncing.current = false;
      return;
    }
    target.current = current.sourceTime;
    video.volume = current.clip.volume;
    if (!s.playing) video.pause();
    const key = asset.objectUrl;
    const play = () => {
      syncing.current = false;
      const state = useEditor.getState();
      if (state.playing)
        void video.play().catch((error: unknown) => {
          // A deliberate seek/source switch can abort an earlier play promise.
          // Its seeked/loadedmetadata callback will resume the current request.
          if (error instanceof DOMException && error.name === "AbortError")
            return;
          state.set({ playing: false });
          setError("Playback could not start. Try pressing Play again.");
        });
      else video.pause();
    };
    const sync = () => {
      if (Math.abs(video.currentTime - target.current) > 0.015) {
        syncing.current = true;
        video.onseeked = play;
        video.currentTime = target.current;
      } else play();
    };
    const changedClip = lastClip.current !== current.clip.id;
    lastClip.current = current.clip.id;
    if (loaded.current !== key) {
      loaded.current = key;
      syncing.current = true;
      video.pause();
      video.src = key;
      video.onloadedmetadata = sync;
      video.load();
    } else if (
      changedClip ||
      !s.playing ||
      Math.abs(video.currentTime - current.sourceTime) > 0.25
    )
      sync();
    else if (video.paused) sync();
  }, [
    s.time,
    s.playing,
    s.revision,
    asset?.objectUrl,
    current?.clip.id,
    current?.clip.volume,
    current?.sourceTime,
  ]);
  useEffect(() => {
    let frame: number;
    function tick() {
      const state = useEditor.getState(),
        video = v.current,
        at = locate(state.clips, state.time);
      if (
        video &&
        state.playing &&
        at &&
        !syncing.current &&
        !video.seeking &&
        video.readyState >= 2
      ) {
        const asset = state.assets.find((a) => a.id === at.clip.assetId);
        if (
          asset &&
          loaded.current === asset.objectUrl &&
          lastClip.current === at.clip.id
        ) {
          if (video.currentTime >= at.clip.sourceEnd - 0.02 || video.ended) {
            const next = at.offset + at.clip.sourceEnd - at.clip.sourceStart;
            state.set({
              time: Math.min(duration(state.clips), next),
              playing: next < duration(state.clips) - 0.001,
            });
          } else if (video.currentTime >= at.clip.sourceStart - 0.02)
            state.set({
              time:
                at.offset +
                Math.min(
                  at.clip.sourceEnd - at.clip.sourceStart,
                  Math.max(0, video.currentTime - at.clip.sourceStart),
                ),
            });
        }
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <section className="preview panel">
      <div className="panel-heading">
        <span>Preview</span>
        <span className="quiet">16:9 · Sequence</span>
      </div>
      <div className="viewer">
        {asset ? (
          <video
            ref={v}
            playsInline
            aria-label="Sequence preview"
            onError={() => {
              setError(
                "This source cannot be played. Reimport a supported MP4 or WebM.",
              );
              s.set({ playing: false });
            }}
          />
        ) : (
          <div className="empty-preview">
            <div className="empty-icon">
              <Film size={32} />
            </div>
            <h1>Your next great cut starts here.</h1>
            <p>
              Drop in your footage. Make a few cuts.
              <br />
              Or just tell Shorties what to change.
            </p>
            <span className="quiet">Your videos stay on this device.</span>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="transport">
        <span className="mono">
          {stamp(s.time)} <span className="quiet">/ {stamp(total)}</span>
        </span>
        <div className="transport-buttons">
          <button
            aria-label="Seek to beginning"
            disabled={!total}
            onClick={() => s.set({ time: 0, playing: false })}
          >
            <SkipBack size={15} />
          </button>
          <button
            className="play"
            aria-label={s.playing ? "Pause" : "Play"}
            disabled={!total || !asset}
            onClick={() =>
              s.set({ playing: !s.playing, time: s.time >= total ? 0 : s.time })
            }
          >
            {s.playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button
            aria-label="Seek to end"
            disabled={!total}
            onClick={() => s.set({ time: total, playing: false })}
          >
            <SkipForward size={15} />
          </button>
        </div>
        <span className="quiet">Local preview</span>
      </div>
      <input
        aria-label="Seek sequence"
        type="range"
        min="0"
        max={total || 1}
        step="0.01"
        value={s.time}
        disabled={!total}
        onChange={(e) =>
          s.set({ time: Number(e.target.value), playing: false })
        }
      />
    </section>
  );
}
