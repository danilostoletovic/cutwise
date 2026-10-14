import { z } from "zod";

export const generationSchema = z
  .object({
    provider: z.literal("runway"),
    model: z.enum(["gen4.5", "gen4_turbo"]),
    prompt: z.string().trim().min(1).max(1000),
    image: z.string().url().max(2048).optional(),
    duration: z.number().int().min(2).max(10),
    ratio: z.enum(["1280:720", "720:1280"]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.model === "gen4_turbo" && !value.image)
      ctx.addIssue({
        code: "custom",
        message: "Gen-4 Turbo requires an image.",
      });
    if (value.image && new URL(value.image).protocol !== "https:")
      ctx.addIssue({
        code: "custom",
        message: "Use a public HTTPS image URL.",
      });
  });
export type Generation = z.infer<typeof generationSchema>;
export type VideoJob = {
  id: string;
  status:
    "PENDING" | "THROTTLED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  progress?: number;
  error?: string;
  outputs: {
    id: string;
    url: string;
    name: string;
    metadata: Record<string, unknown>;
  }[];
};
export interface VideoProvider {
  create(input: Generation): Promise<string>;
  poll(id: string): Promise<VideoJob>;
}
export const estimateCredits = (model: Generation["model"], seconds: number) =>
  seconds * (model === "gen4.5" ? 12 : 5);
