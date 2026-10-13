import { z } from "zod";
export const clipSchema = z
  .object({
    id: z.string().min(1).max(100),
    assetId: z.string().min(1).max(100),
    sourceStart: z.number().finite().min(0),
    sourceEnd: z.number().finite().positive().max(86400),
    volume: z.number().min(0).max(1),
  })
  .strict();
export type Clip = z.infer<typeof clipSchema>;
export type Asset = {
  id: string;
  name: string;
  duration: number;
  mimeType: string;
  objectUrl: string;
  file: File;
  thumbnail?: string;
};
export const operationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("trim_start"),
    clipId: z.string(),
    seconds: z.number().positive(),
  }),
  z.object({
    type: z.literal("trim_end"),
    clipId: z.string(),
    seconds: z.number().positive(),
  }),
  z.object({
    type: z.literal("split_clip"),
    clipId: z.string(),
    seconds: z.number().positive(),
  }),
  z.object({ type: z.literal("delete_clip"), clipId: z.string() }),
  z.object({
    type: z.literal("remove_range"),
    start: z.number().min(0),
    end: z.number().positive(),
  }),
  z.object({
    type: z.literal("move_clip"),
    clipId: z.string(),
    index: z.number().int().min(0),
  }),
  z.object({
    type: z.literal("set_volume"),
    clipId: z.string(),
    value: z.number().min(0).max(1),
  }),
]);
export const resultSchema = z.object({
  operations: z.array(operationSchema).max(30),
  summary: z.string(),
  clarification: z.string().nullable(),
});
export type Operation = z.infer<typeof operationSchema>;
export const duration = (clips: Clip[]) =>
  clips.reduce((n, c) => n + c.sourceEnd - c.sourceStart, 0);
export function locate(clips: Clip[], time: number) {
  let offset = 0;
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i],
      length = clip.sourceEnd - clip.sourceStart;
    if (time < offset + length || i === clips.length - 1)
      return {
        clip,
        index: i,
        offset,
        sourceTime:
          clip.sourceStart + Math.max(0, Math.min(length, time - offset)),
      };
    offset += length;
  }
  return null;
}
export function validateClips(clips: Clip[]) {
  const ids = new Set<string>();
  for (const c of clips) {
    clipSchema.parse(c);
    if (c.sourceEnd - c.sourceStart < 0.05)
      throw new Error("A clip must be at least 0.05 seconds long.");
    if (ids.has(c.id)) throw new Error("Duplicate clip ID.");
    ids.add(c.id);
  }
  return clips;
}
export function applyOperations(
  input: Clip[],
  operations: Operation[],
  id = () => crypto.randomUUID(),
): Clip[] {
  let clips = input.map((c) => ({ ...c }));
  for (const raw of operations) {
    const op = operationSchema.parse(raw);
    if (op.type === "remove_range") {
      if (op.end <= op.start || op.end > duration(clips) + 0.001)
        throw new Error("Range is outside the sequence.");
      let offset = 0;
      clips = clips.flatMap((c) => {
        const length = c.sourceEnd - c.sourceStart,
          a = offset,
          b = offset + length;
        offset = b;
        if (op.end <= a || op.start >= b) return [c];
        const out: Clip[] = [];
        if (op.start > a)
          out.push({ ...c, sourceEnd: c.sourceStart + op.start - a });
        if (op.end < b)
          out.push({
            ...c,
            id: out.length ? id() : c.id,
            sourceStart: c.sourceStart + op.end - a,
          });
        return out;
      });
    } else {
      const index = clips.findIndex((c) => c.id === op.clipId);
      if (index < 0) throw new Error("The requested clip no longer exists.");
      const c = clips[index];
      switch (op.type) {
        case "trim_start":
          c.sourceStart += op.seconds;
          break;
        case "trim_end":
          c.sourceEnd -= op.seconds;
          break;
        case "set_volume":
          c.volume = op.value;
          break;
        case "delete_clip":
          clips.splice(index, 1);
          break;
        case "move_clip":
          if (op.index >= clips.length) throw new Error("Invalid destination.");
          clips.splice(index, 1);
          clips.splice(op.index, 0, c);
          break;
        case "split_clip":
          if (op.seconds >= c.sourceEnd - c.sourceStart || op.seconds < 0.05)
            throw new Error("Split inside the clip, away from its edges.");
          clips.splice(
            index,
            1,
            { ...c, sourceEnd: c.sourceStart + op.seconds },
            { ...c, id: id(), sourceStart: c.sourceStart + op.seconds },
          );
          break;
      }
    }
    validateClips(clips);
  }
  return clips;
}
export function describe(ops: Operation[]) {
  return ops
    .map((op) => {
      switch (op.type) {
        case "trim_start":
          return `Removed ${op.seconds}s from clip start`;
        case "trim_end":
          return `Removed ${op.seconds}s from clip end`;
        case "split_clip":
          return `Split clip at ${op.seconds}s`;
        case "delete_clip":
          return "Deleted clip";
        case "remove_range":
          return `Removed sequence ${op.start}–${op.end}s`;
        case "move_clip":
          return `Moved clip to position ${op.index + 1}`;
        case "set_volume":
          return `Set clip volume to ${Math.round(op.value * 100)}%`;
      }
    })
    .join(" · ");
}
