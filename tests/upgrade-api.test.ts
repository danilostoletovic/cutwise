import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/ai/edit/route";
import { presets } from "../lib/styles";
test("mocked OpenAI transport validates montage and timestamp plans and rejects malformed output", async () => {
  const oldFetch = globalThis.fetch,
    old = { ...process.env };
  let result: object = {
    operations: [
      {
        type: "build_montage",
        targetSeconds: 6,
        clipSeconds: 2,
        zoom: 1.15,
        transition: "cut",
        transitionDuration: 0.2,
        soundIntensity: 0.35,
      },
    ],
    summary: "plan",
    clarification: null,
  };
  let calls = 0;
  try {
    process.env.OPENAI_API_KEY = "development-test-key";
    process.env.DEMO_ACCESS_CODE = "test-code";
    globalThis.fetch = async (input, init) => {
      assert.match(String(input), /api\.openai\.com\/v1\/responses/);
      calls++;
      const body = JSON.parse(String(init?.body));
      assert.equal(body.store, false);
      assert.match(body.input[0].content, /Only metadata/);
      assert.match(body.input[1].content, /Minecraft Fast-Paced/);
      return Response.json({
        id: "resp_test",
        object: "response",
        status: "completed",
        output: [
          {
            id: "msg_test",
            type: "message",
            role: "assistant",
            status: "completed",
            content: [
              {
                type: "output_text",
                text: JSON.stringify(result),
                annotations: [],
              },
            ],
          },
        ],
      });
    };
    const payload = {
      prompt: "Create a 6 second montage",
      revision: 1,
      clips: [
        { id: "c", assetId: "a", sourceStart: 10, sourceEnd: 20, volume: 1 },
      ],
      selectedClipId: "c",
      playheadTime: 0,
      timelineDuration: 10,
      style: presets[0],
      media: [
        { id: "a", name: "game.webm", duration: 20, width: 320, height: 180 },
      ],
    };
    const request = () =>
      new Request("https://shorties.test/api/ai/edit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-demo-code": "test-code",
        },
        body: JSON.stringify(payload),
      });
    let response = await POST(request());
    assert.equal(response.status, 200);
    assert.equal((await response.json()).operations[0].type, "build_montage");
    result = {
      operations: [{ type: "zoom_at", time: 3, value: 1.4 }],
      summary: "zoom",
      clarification: null,
    };
    response = await POST(request());
    assert.equal(response.status, 200);
    result = {
      operations: [{ type: "zoom_at", time: 30, value: 1.4 }],
      summary: "invalid",
      clarification: null,
    };
    response = await POST(request());
    assert.equal(response.status, 422);
    result = {
      operations: [],
      summary: "",
      clarification: "Music replacement is not supported yet.",
    };
    response = await POST(request());
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).operations, []);
    assert.equal(calls, 4);
  } finally {
    globalThis.fetch = oldFetch;
    for (const key of ["OPENAI_API_KEY", "DEMO_ACCESS_CODE"]) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
  }
});
