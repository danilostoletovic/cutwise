import { z } from "zod";
import { Generation, VideoJob, VideoProvider } from "./types";

export class ProviderError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
const taskSchema = z.object({
  id: z.string().uuid(),
  status: z.enum([
    "PENDING",
    "THROTTLED",
    "RUNNING",
    "SUCCEEDED",
    "FAILED",
    "CANCELLED",
  ]),
  progress: z.number().min(0).max(1).optional(),
  failureCode: z.string().optional(),
  output: z.array(z.string().url()).optional(),
});
export class RunwayProvider implements VideoProvider {
  constructor(
    private key: string,
    private request: typeof fetch = fetch,
  ) {}
  private async call(path: string, body?: object) {
    let response: Response;
    try {
      response = await this.request(`https://api.dev.runwayml.com/v1/${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${this.key}`,
          "X-Runway-Version": "2024-11-06",
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(25000),
        cache: "no-store",
      });
    } catch {
      throw new ProviderError(
        "Runway request timed out or could not connect. A submission may have been accepted; check Runway before submitting again.",
      );
    }
    if (!response.ok) {
      const message =
        response.status === 429
          ? "Runway usage or concurrency limit reached. Wait before retrying."
          : response.status === 401 || response.status === 403
            ? "Runway credentials or account access were rejected."
            : response.status === 402
              ? "Runway credits are unavailable. Check provider billing."
              : "Runway rejected the request. Check inputs and provider dashboard.";
      throw new ProviderError(message, response.status === 429 ? 429 : 502);
    }
    return response.json();
  }
  async create(input: Generation) {
    const data = await this.call(
      input.image ? "image_to_video" : "text_to_video",
      {
        model: input.model,
        promptText: input.prompt,
        duration: input.duration,
        ratio: input.ratio,
        ...(input.image ? { promptImage: input.image } : {}),
      },
    );
    return z.object({ id: z.string().uuid() }).parse(data).id;
  }
  async poll(id: string): Promise<VideoJob> {
    const data = taskSchema.parse(
      await this.call(`tasks/${encodeURIComponent(id)}`),
    );
    return {
      id: data.id,
      status: data.status,
      progress: data.progress,
      error:
        data.status === "FAILED"
          ? `Runway generation failed${data.failureCode ? ` (${data.failureCode})` : ""}. Check the provider dashboard.`
          : undefined,
      outputs:
        data.status === "SUCCEEDED"
          ? (data.output ?? []).map((url, index) => ({
              id: `${id}:${index}`,
              url,
              name: `Runway-${id.slice(0, 8)}-${index + 1}.mp4`,
              metadata: { provider: "runway", taskId: id },
            }))
          : [],
    };
  }
}
