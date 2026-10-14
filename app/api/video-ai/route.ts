import {
  availability,
  authorize,
  runway,
  jobToken,
  readJob,
  failure,
} from "@/lib/video-ai/server";
import { generationSchema } from "@/lib/video-ai/types";
import { ProviderError } from "@/lib/video-ai/runway";
export const runtime = "nodejs";
const submissions = new Map<string, number>();
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("job");
  if (!token)
    return Response.json(
      { providers: availability() },
      { headers: { "Cache-Control": "no-store" } },
    );
  try {
    authorize(req);
    const provider = runway();
    return Response.json(await provider.poll(readJob(token)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    authorize(req);
    const provider = runway();
    const reader = req.body?.getReader();
    if (!reader) throw new ProviderError("Missing request.", 400);
    const decoder = new TextDecoder();
    let text = "",
      bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 8192) {
        await reader.cancel();
        throw new ProviderError("Request too large.", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const input = generationSchema.parse(JSON.parse(text));
    // Per-process guard only; provider account spend limits remain authoritative.
    const key = String(Math.floor(Date.now() / 3600000));
    for (const k of submissions.keys()) if (k !== key) submissions.delete(k);
    const count = submissions.get(key) ?? 0;
    if (count >= 10)
      throw new ProviderError(
        "Local generation limit reached. Try next hour.",
        429,
      );
    submissions.set(key, count + 1);
    const id = await provider.create(input);
    return Response.json({ token: jobToken(id), id }, { status: 202 });
  } catch (e) {
    return failure(e);
  }
}
