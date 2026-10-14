"use client";
import { useEffect, useState } from "react";
import { EditingStyle, presets } from "@/lib/styles";
import { loadStyles, saveStyles } from "@/lib/persistence";
import { Operation } from "@/lib/timeline";
import { styleFeedback } from "@/lib/styles";
type Props = {
  style: EditingStyle;
  onChange: (style: EditingStyle) => void;
  onAssemble: () => void;
  target: number;
  setTarget: (n: number) => void;
  disabled: boolean;
  feedback?: { text: string; operations: Operation[] } | null;
};
export default function StylePanel({
  style,
  onChange,
  onAssemble,
  target,
  setTarget,
  disabled,
  feedback,
}: Props) {
  const [custom, setCustom] = useState<EditingStyle[]>([]),
    [message, setMessage] = useState(""),
    [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    loadStyles()
      .then((v) => {
        if (live) {
          setCustom(v);
          setReady(true);
        }
      })
      .catch(() => {
        if (live)
          setMessage(
            "Could not load styles. Existing saved preferences will not be overwritten.",
          );
      });
    return () => {
      live = false;
    };
  }, []);
  async function save(preference = false) {
    try {
      const updated =
        preference && feedback
          ? styleFeedback(style, feedback.operations, feedback.text)
          : style;
      const existing = custom.some((x) => x.id === updated.id),
        next = {
          ...updated,
          id: existing ? updated.id : crypto.randomUUID(),
          name: updated.name,
        };
      const list = existing
        ? custom.map((x) => (x.id === next.id ? next : x))
        : [...custom, next];
      await saveStyles(list);
      setCustom(list);
      onChange(next);
      setMessage(
        preference
          ? "Preference saved explicitly to this style."
          : "Custom style saved on this device.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save style.");
    }
  }
  return (
    <div className="style-panel">
      <p className="tool-intro">
        A repeatable starting point. Adjust the recipe, then make it yours.
      </p>
      <div className="style-presets">
        {[...presets, ...custom].map((p) => (
          <button
            key={p.id}
            className={p.id === style.id ? "active" : ""}
            onClick={() => onChange({ ...p })}
          >
            <strong>{p.name}</strong>
            <span>
              {p.pace} · {p.clipDuration}s cuts · {p.ratio}
            </span>
          </button>
        ))}
      </div>
      <details open className="style-config">
        <summary>Customize recipe</summary>
        <label>
          Style name
          <input
            aria-label="Style name"
            value={style.name}
            onChange={(e) => onChange({ ...style, name: e.target.value })}
            maxLength={60}
          />
        </label>
        <label>
          Average cut (seconds)
          <input
            aria-label="Style clip duration"
            type="number"
            min={0.5}
            max={30}
            step={0.5}
            value={style.clipDuration}
            onChange={(e) =>
              onChange({ ...style, clipDuration: Number(e.target.value) })
            }
          />
        </label>
        <label>
          Pace
          <select
            value={style.pace}
            onChange={(e) =>
              onChange({
                ...style,
                pace: e.target.value as EditingStyle["pace"],
              })
            }
          >
            {["fast", "balanced", "slow"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Transition
          <select
            aria-label="Style transition"
            value={style.transition}
            onChange={(e) =>
              onChange({
                ...style,
                transition: e.target.value as "cut" | "fade",
              })
            }
          >
            <option value="cut">Hard cut</option>
            <option value="fade">Fade through black</option>
          </select>
        </label>
        <label>
          Fade duration
          <input
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={style.transitionDuration}
            onChange={(e) =>
              onChange({ ...style, transitionDuration: Number(e.target.value) })
            }
          />
        </label>
        <label>
          Zoom
          <input
            aria-label="Style zoom"
            type="number"
            min={1}
            max={2}
            step={0.05}
            value={style.zoom}
            onChange={(e) =>
              onChange({ ...style, zoom: Number(e.target.value) })
            }
          />
        </label>
        <label>
          Sound intensity
          <input
            aria-label="Style sound intensity"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={style.soundIntensity}
            onChange={(e) =>
              onChange({ ...style, soundIntensity: Number(e.target.value) })
            }
          />
        </label>
        <label>
          Canvas
          <select
            value={style.ratio}
            onChange={(e) =>
              onChange({
                ...style,
                ratio: e.target.value as EditingStyle["ratio"],
              })
            }
          >
            {["16:9", "9:16", "1:1"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <details>
          <summary>Creative brief preferences</summary>
          <small>
            Saved for planning. Music, captions and color grading are not
            generated automatically.
          </small>
          <label>
            Music direction
            <input
              value={style.music}
              onChange={(e) => onChange({ ...style, music: e.target.value })}
            />
          </label>
          <label>
            Typography
            <select
              value={style.typography}
              onChange={(e) =>
                onChange({
                  ...style,
                  typography: e.target.value as EditingStyle["typography"],
                })
              }
            >
              <option>bold</option>
              <option>clean</option>
            </select>
          </label>
          <label>
            Caption treatment
            <select
              value={style.caption}
              onChange={(e) =>
                onChange({
                  ...style,
                  caption: e.target.value as EditingStyle["caption"],
                })
              }
            >
              {["none", "lower-third", "emphasis"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Color direction
            <input
              type="color"
              value={style.color}
              onChange={(e) => onChange({ ...style, color: e.target.value })}
            />
          </label>
        </details>
      </details>
      <label>
        Target length (seconds)
        <input
          aria-label="Target length"
          type="number"
          min={0.5}
          max={600}
          value={target}
          onChange={(e) => setTarget(Number(e.target.value))}
        />
      </label>
      <button className="primary" disabled={disabled} onClick={onAssemble}>
        Assemble style first cut
      </button>
      <small>
        Uses current source ranges and round-robin ordering. No highlight
        detection. Undo restores your sequence.
      </small>
      <button className="outline" disabled={!ready} onClick={() => void save()}>
        Save custom style
      </button>
      {feedback && (
        <button
          className="outline"
          disabled={!ready}
          onClick={() => void save(true)}
        >
          Save last edit preference to style
        </button>
      )}
      {style.feedback && <small>Saved feedback: {style.feedback}</small>}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
