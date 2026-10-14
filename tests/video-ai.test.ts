import { test } from "node:test";
import assert from "node:assert/strict";
import { RunwayProvider } from "../lib/video-ai/runway";
import { generationSchema, estimateCredits } from "../lib/video-ai/types";
import { jobToken, readJob } from "../lib/video-ai/server";
import { GET, POST } from "../app/api/video-ai/route";
const id = "12345678-1234-4234-8234-123456789abc";
const input = {
  provider: "runway" as const,
  model: "gen4.5" as const,
  prompt: "A moving landscape",
  duration: 5,
  ratio: "720:1280" as const,
};
test("model validation and current estimates", () => {
  assert.equal(estimateCredits("gen4.5", 5), 60);
  assert.equal(estimateCredits("gen4_turbo", 5), 25);
  assert.equal(
    generationSchema.safeParse({ ...input, model: "gen4_turbo" }).success,
    false,
  );
  assert.equal(
    generationSchema.safeParse({
      ...input,
      image: "http://example.com/image.png",
    }).success,
    false,
  );
  assert.equal(
    generationSchema.safeParse({ ...input, duration: 11 }).success,
    false,
  );
});
test("mocked official Runway transport: text/image creation and asynchronous states", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  let state = "RUNNING";
  const provider = new RunwayProvider("secret-test-key", (async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json(
      init?.method === "POST"
        ? { id }
        : {
            id,
            status: state,
            progress: 0.5,
            output: ["https://example.com/video.mp4"],
          },
    );
  }) as typeof fetch);
  assert.equal(await provider.create(input), id);
  assert.match(calls[0].url, /\/v1\/text_to_video$/);
  assert.equal(
    JSON.parse(String(calls[0].init?.body)).promptText,
    input.prompt,
  );
  await provider.create({ ...input, image: "https://example.com/start.png" });
  assert.match(calls[1].url, /\/v1\/image_to_video$/);
  assert.deepEqual((await provider.poll(id)).outputs, []);
  state = "SUCCEEDED";
  const job = await provider.poll(id);
  assert.equal(job.outputs[0].metadata.taskId, id);
  assert.equal(JSON.stringify(job).includes("secret-test-key"), false);
  state = "FAILED";
  assert.match((await provider.poll(id)).error!, /failed/);
});
test("mocked Runway limits and malformed responses never succeed", async () => {
  const provider = new RunwayProvider("key", (async () =>
    Response.json({}, { status: 429 })) as typeof fetch);
  await assert.rejects(provider.create(input), /limit reached/);
  const malformed = new RunwayProvider("key", (async () =>
    Response.json({ status: "done" })) as typeof fetch);
  await assert.rejects(malformed.poll(id));
});
test("routes fail closed, enforce code and prevent arbitrary job access", async () => {
  const old = {
    key: process.env.RUNWAY_API_KEY,
    enabled: process.env.VIDEO_AI_ENABLED,
    code: process.env.DEMO_ACCESS_CODE,
  };
  try {
    delete process.env.RUNWAY_API_KEY;
    process.env.VIDEO_AI_ENABLED = "false";
    process.env.DEMO_ACCESS_CODE = "private-test";
    const config = await (
      await GET(new Request("http://localhost/api/video-ai"))
    ).json();
    assert.equal(config.providers[0].enabled, false);
    assert.equal(config.providers[1].enabled, false);
    const req = (code?: string, origin?: string) =>
      new Request("http://localhost/api/video-ai", {
        method: "POST",
        headers: {
          ...(code ? { "x-demo-code": code } : {}),
          ...(origin ? { origin } : {}),
        },
        body: JSON.stringify(input),
      });
    assert.equal((await POST(req())).status, 401);
    assert.equal((await POST(req("private-test"))).status, 503);
    assert.equal(
      (await POST(req("private-test", "https://evil.example"))).status,
      403,
    );
    process.env.RUNWAY_API_KEY = "signing-test";
    assert.equal(readJob(jobToken(id)), id);
    assert.throws(() => readJob(jobToken(id) + "changed"));
  } finally {
    for (const [name, value] of Object.entries({
      RUNWAY_API_KEY: old.key,
      VIDEO_AI_ENABLED: old.enabled,
      DEMO_ACCESS_CODE: old.code,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
