import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { RunwayProvider, ProviderError } from "./runway";
import { opusSetup } from "./opusclip";

export function availability() {
  return [
    {
      id: "runway",
      name: "Runway",
      enabled: !!(
        process.env.RUNWAY_API_KEY &&
        process.env.VIDEO_AI_ENABLED === "true" &&
        process.env.DEMO_ACCESS_CODE
      ),
      reason:
        "Requires RUNWAY_API_KEY, VIDEO_AI_ENABLED=true and DEMO_ACCESS_CODE on the server. Live provider testing pending.",
    },
    { id: "opusclip", name: "OpusClip", enabled: false, reason: opusSetup },
  ];
}
export function authorize(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).origin !== new URL(req.url).origin)
    throw new ProviderError("Origin not allowed.", 403);
  const expected = Buffer.from(process.env.DEMO_ACCESS_CODE ?? "");
  const actual = Buffer.from(req.headers.get("x-demo-code") ?? "");
  if (
    !expected.length ||
    expected.length !== actual.length ||
    !timingSafeEqual(expected, actual)
  )
    throw new ProviderError(
      "Enter the private demo access code to use video providers.",
      401,
    );
}
export function runway() {
  if (!availability()[0].enabled)
    throw new ProviderError(
      "Runway is disabled. Configure the server first.",
      503,
    );
  return new RunwayProvider(process.env.RUNWAY_API_KEY!);
}
const tokenSchema = z.object({ id: z.string().uuid(), expires: z.number() });
function sign(value: string) {
  return createHmac("sha256", process.env.RUNWAY_API_KEY!)
    .update(value)
    .digest("base64url");
}
export function jobToken(id: string) {
  const payload = Buffer.from(
    JSON.stringify({ id, expires: Date.now() + 48 * 3600000 }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
export function readJob(token: string) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature)
    throw new ProviderError("Invalid job token.", 400);
  const a = Buffer.from(signature),
    b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b))
    throw new ProviderError("Invalid job token.", 403);
  const value = tokenSchema.parse(
    JSON.parse(Buffer.from(payload, "base64url").toString()),
  );
  if (value.expires < Date.now())
    throw new ProviderError("Job access expired. Check Runway dashboard.", 410);
  return value.id;
}
export function failure(e: unknown) {
  return Response.json(
    {
      error:
        e instanceof ProviderError
          ? e.message
          : "Invalid input or unexpected provider response.",
    },
    { status: e instanceof ProviderError ? e.status : 400 },
  );
}
