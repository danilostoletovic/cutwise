import { z } from "zod";
import { Clip, Operation, applyOperations } from "./timeline";
export const styleSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(60),
  clipDuration: z.number().min(0.5).max(30),
  pace: z.enum(["fast", "balanced", "slow"]),
  transition: z.enum(["cut", "fade"]),
  transitionDuration: z.number().min(0).max(2),
  zoom: z.number().min(1).max(2),
  soundIntensity: z.number().min(0).max(1),
  music: z.string().max(120),
  typography: z.enum(["bold", "clean"]),
  caption: z.enum(["none", "lower-third", "emphasis"]),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  ratio: z.enum(["16:9", "9:16", "1:1"]),
  feedback: z.string().max(1000),
});
export type EditingStyle = z.infer<typeof styleSchema>;
const base: EditingStyle = {
  id: "minecraft",
  name: "Minecraft Fast-Paced",
  clipDuration: 2,
  pace: "fast",
  transition: "cut",
  transitionDuration: 0.2,
  zoom: 1.15,
  soundIntensity: 0.35,
  music: "Energetic electronic",
  typography: "bold",
  caption: "emphasis",
  color: "#b5a2ff",
  ratio: "16:9",
  feedback: "",
};
export const presets: EditingStyle[] = [
  base,
  {
    ...base,
    id: "gaming",
    name: "Gaming Highlights",
    clipDuration: 3,
    zoom: 1.1,
  },
  {
    ...base,
    id: "cinematic",
    name: "Cinematic",
    clipDuration: 6,
    pace: "slow",
    transition: "fade",
    transitionDuration: 0.6,
    zoom: 1,
    soundIntensity: 0,
    music: "Ambient instrumental",
    typography: "clean",
    caption: "none",
  },
  {
    ...base,
    id: "talking",
    name: "Talking Head",
    clipDuration: 12,
    pace: "balanced",
    zoom: 1,
    soundIntensity: 0,
    music: "Subtle background",
    typography: "clean",
    caption: "lower-third",
  },
  {
    ...base,
    id: "social",
    name: "Social Media Short",
    clipDuration: 2.5,
    ratio: "9:16",
  },
];
// Metadata-based pacing only: no claim of recognizing highlights or silence.
export function firstCut(
  clips: Clip[],
  raw: EditingStyle,
  target: number,
): Clip[] {
  const style = styleSchema.parse(raw);
  if (!Number.isFinite(target) || target < 0.5 || target > 600)
    throw new Error("Choose a length from 0.5 to 600 seconds.");
  if (!clips.length) throw new Error("Upload footage first.");
  return applyOperations(clips, [
    {
      type: "build_montage",
      targetSeconds: target,
      clipSeconds: style.clipDuration,
      zoom: style.zoom,
      transition: style.transition,
      transitionDuration: style.transitionDuration,
      soundIntensity: style.soundIntensity,
    },
  ]);
}
export function styleFeedback(
  style: EditingStyle,
  ops: Operation[],
  text: string,
): EditingStyle {
  const next = { ...style, feedback: text.slice(0, 1000) };
  for (const op of ops) {
    if (op.type === "zoom_at") next.zoom = op.value;
    if (op.type === "set_transition") {
      next.transition = op.kind;
      next.transitionDuration = op.duration;
    }
    if (op.type === "sound_at") next.soundIntensity = op.volume;
    if (op.type === "remove_sound_at") next.soundIntensity = 0;
  }
  return styleSchema.parse(next);
}
