import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/ai/edit/route";
test("production AI fails closed and enforces access, origin and input limits", async () => {
  const old = { ...process.env };
  try {
    Object.assign(process.env, {
      NODE_ENV: "production",
      OPENAI_API_KEY: "not-a-real-key",
    });
    delete process.env.DEMO_ACCESS_CODE;
    const request = (body: string, headers: Record<string, string> = {}) =>
      new Request("https://shorties.test/api/ai/edit", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body,
      });
    assert.equal((await POST(request("{}"))).status, 503);
    process.env.DEMO_ACCESS_CODE = "private-test-code";
    assert.equal((await POST(request("{}"))).status, 401);
    assert.equal(
      (await POST(request("{}", { "x-demo-code": "wrong" }))).status,
      401,
    );
    assert.equal(
      (
        await POST(
          request("{}", {
            "x-demo-code": "private-test-code",
            origin: "https://attacker.test",
          }),
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await POST(
          request("x".repeat(32769), { "x-demo-code": "private-test-code" }),
        )
      ).status,
      413,
    );
    assert.equal(
      (await POST(request("{}", { "x-demo-code": "private-test-code" })))
        .status,
      400,
    );
    delete process.env.OPENAI_API_KEY;
    assert.equal((await POST(request("{}"))).status, 503);
  } finally {
    for (const key of ["NODE_ENV", "OPENAI_API_KEY", "DEMO_ACCESS_CODE"]) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
  }
});
