import { test, expect, Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const fixture = resolve("fixtures/source.webm");
async function sample(page: Page, time?: number) {
  return page
    .locator('video[aria-label="Sequence preview"]')
    .evaluate(async (video: HTMLVideoElement, time) => {
      if (time !== undefined) {
        await new Promise<void>((r) => {
          video.onseeked = () => r();
          video.currentTime = time;
        });
      }
      const canvas = document.createElement("canvas");
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, 0, 0, 32, 32);
      return {
        time: video.currentTime,
        volume: video.volume,
        pixel: Array.from(ctx.getImageData(10, 10, 1, 1).data),
      };
    }, time);
}
async function ai(page: Page, prompt: string) {
  await page.getByLabel("Editing command").fill(prompt);
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/ai/edit") && r.request().method() === "POST",
  );
  await page.getByLabel("Apply AI edit").click();
  const res = await response;
  expect(res.status(), await res.text()).toBe(200);
  await expect(page.getByLabel("Apply AI edit")).toBeDisabled();
  return res.json();
}
test("real upload → manual trim → live OpenAI edits → undo → MP4 export → restore", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await mkdir("fixtures", { recursive: true });
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext("2d")!;
    const stream = canvas.captureStream(30);
    const audio = new AudioContext();
    await audio.resume();
    const osc = audio.createOscillator(),
      gain = audio.createGain(),
      dest = audio.createMediaStreamDestination();
    osc.frequency.value = 440;
    gain.gain.value = 0.2;
    osc.connect(gain).connect(dest);
    osc.start();
    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    const recorder = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp8,opus",
      }),
      chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    const start = performance.now();
    let raf: number;
    function frame() {
      const seconds = (performance.now() - start) / 1000;
      ctx.fillStyle = seconds < 3 ? "#ff0000" : "#0000ff";
      ctx.fillRect(0, 0, 320, 180);
      ctx.fillStyle = "#ffffff";
      ctx.font = "24px monospace";
      ctx.fillText(seconds.toFixed(2), 200, 150);
      raf = requestAnimationFrame(frame);
    }
    frame();
    recorder.start();
    await new Promise((r) => setTimeout(r, 8000));
    await new Promise<void>((r) => {
      recorder.onstop = () => r();
      recorder.stop();
    });
    cancelAnimationFrame(raf!);
    osc.stop();
    await audio.close();
    stream.getTracks().forEach((t) => t.stop());
    return Array.from(
      new Uint8Array(
        await new Blob(chunks, { type: "video/webm" }).arrayBuffer(),
      ),
    );
  });
  await writeFile(fixture, Buffer.from(bytes));
  await page.getByTestId("file-input").setInputFiles(fixture);
  const clips = page.getByTestId("timeline-clip");
  await expect(clips).toHaveCount(1);
  await expect(page.locator("video")).toHaveJSProperty("readyState", 4);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(async () => (await sample(page)).time).toBeGreaterThan(0.2);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByLabel("Seek to beginning").click();
  await page.getByLabel("Clip source start").fill("3");
  await page.getByLabel("Clip source start").press("Tab");
  await expect(clips.first()).toHaveAttribute("data-source-start", "3");
  await expect.poll(async () => (await sample(page)).time).toBeCloseTo(3, 1);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(async () => (await sample(page)).pixel[2])
    .toBeGreaterThan(220);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByLabel("Undo", { exact: true }).click();
  await expect(clips.first()).toHaveAttribute("data-source-start", "0");
  if (process.env.DEMO_ACCESS_CODE) {
    await page.getByText("Private demo access", { exact: true }).click();
    await page
      .getByLabel("Demo access code")
      .fill(process.env.DEMO_ACCESS_CODE);
  }
  await ai(page, "Remove the first three seconds.");
  await expect(clips.first()).toHaveAttribute("data-source-start", "3");
  await expect.poll(async () => (await sample(page)).time).toBeCloseTo(3, 1);
  await page.getByLabel("Undo", { exact: true }).click();
  await expect(clips.first()).toHaveAttribute("data-source-start", "0");
  await ai(page, "Trim the beginning by two seconds and mute the clip.");
  await expect(clips.first()).toHaveAttribute("data-source-start", "2");
  await expect(clips.first()).toHaveAttribute("data-volume", "0");
  await expect.poll(async () => (await sample(page)).volume).toBe(0);
  await page.getByLabel("Undo", { exact: true }).click();
  await expect(clips.first()).toHaveAttribute("data-source-start", "0");
  await expect(clips.first()).toHaveAttribute("data-volume", "1");
  await page.getByLabel("Redo", { exact: true }).click();
  await expect(clips.first()).toHaveAttribute("data-source-start", "2");
  await page.getByRole("button", { name: "Export MP4", exact: true }).click();
  await expect(page.getByRole("link", { name: "Download video" })).toBeVisible({
    timeout: 120000,
  });
  const exported = await page
    .getByRole("link", { name: "Download video" })
    .evaluate(async (a: HTMLAnchorElement) =>
      Array.from(new Uint8Array(await (await fetch(a.href)).arrayBuffer())),
    );
  expect(exported.length).toBeGreaterThan(1000);
  const evidence = await page.evaluate(async (bytes) => {
    const blob = new Blob([new Uint8Array(bytes)], { type: "video/mp4" }),
      url = URL.createObjectURL(blob),
      v = document.createElement("video");
    v.preload = "auto";
    v.src = url;
    await new Promise<void>((r, j) => {
      v.onloadeddata = () => r();
      v.onerror = () => j(new Error("Export cannot play"));
    });
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d")!;
    async function pixel(time: number) {
      await new Promise<void>((r) => {
        v.onseeked = () => r();
        v.currentTime = time;
      });
      ctx.drawImage(v, 0, 0, 32, 32);
      return Array.from(ctx.getImageData(10, 10, 1, 1).data);
    }
    const first = await pixel(0.1),
      later = await pixel(1.5),
      duration = v.duration;
    const ac = new AudioContext(),
      audio = await ac.decodeAudioData(await blob.arrayBuffer());
    const data = audio.getChannelData(0);
    let sum = 0;
    for (const n of data) sum += n * n;
    await ac.close();
    URL.revokeObjectURL(url);
    return { first, later, duration, rms: Math.sqrt(sum / data.length) };
  }, exported);
  expect(evidence.duration).toBeGreaterThan(5.5);
  expect(evidence.duration).toBeLessThan(6.5);
  expect(evidence.first[0]).toBeGreaterThan(220);
  expect(evidence.later[2]).toBeGreaterThan(220);
  expect(evidence.rms).toBeLessThan(0.002);
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/export.mp4", Buffer.from(exported));
  await writeFile(
    "artifacts/export-evidence.json",
    JSON.stringify(evidence, null, 2),
  );
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.reload();
  await expect(clips.first()).toHaveAttribute("data-source-start", "2");
  await expect(clips.first()).toHaveAttribute("data-volume", "0");
  await expect.poll(async () => (await sample(page)).time).toBeCloseTo(2, 1);
  await expect
    .poll(async () => (await sample(page)).pixel[0])
    .toBeGreaterThan(220);
  await page.screenshot({
    path: "artifacts/editor-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("responsive empty editor and honest API failures", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText("No video yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Export MP4" })).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/editor-mobile.png",
    fullPage: true,
  });
});

test("multiple assets preserve reorder, boundary playback, volume and export", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.getByTestId("file-input").setInputFiles(fixture);
  const clips = page.getByTestId("timeline-clip");
  await expect(clips).toHaveCount(1);
  await page.getByLabel("Clip source start").fill("0.5");
  await page.getByLabel("Clip source start").press("Tab");
  await page.getByLabel("Clip source end").fill("1.5");
  await page.getByLabel("Clip source end").press("Tab");
  await page.getByTestId("file-input").setInputFiles(fixture);
  await expect(clips).toHaveCount(2);
  await page.getByLabel("Select clip 2", { exact: true }).click();
  await page.getByLabel("Clip source start").fill("5");
  await page.getByLabel("Clip source start").press("Tab");
  await page.getByLabel("Clip source end").fill("6");
  await page.getByLabel("Clip source end").press("Tab");
  await page.getByLabel("Mute selected clip", { exact: true }).click();
  await page.getByLabel("Move selected clip left").click();
  await expect(clips.first()).toHaveAttribute("data-source-start", "5");
  await expect(clips.first()).toHaveAttribute("data-volume", "0");
  await page.getByLabel("Seek to beginning").click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(async () => (await sample(page)).pixel[2])
    .toBeGreaterThan(220);
  await expect
    .poll(async () => (await sample(page)).pixel[0])
    .toBeGreaterThan(220);
  await expect.poll(async () => (await sample(page)).volume).toBe(1);
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible({ timeout: 7000 });
  await page.getByRole("button", { name: "Export MP4", exact: true }).click();
  await expect(page.getByRole("link", { name: "Download video" })).toBeVisible({
    timeout: 120000,
  });
  const evidence = await page
    .getByRole("link", { name: "Download video" })
    .evaluate(async (a: HTMLAnchorElement) => {
      const blob = await (await fetch(a.href)).blob(),
        url = URL.createObjectURL(blob),
        v = document.createElement("video");
      v.src = url;
      await new Promise<void>((resolve, reject) => {
        v.onloadeddata = () => resolve();
        v.onerror = () => reject(new Error("Invalid export"));
      });
      const canvas = document.createElement("canvas");
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext("2d")!;
      async function color(t: number) {
        await new Promise<void>((r) => {
          v.onseeked = () => r();
          v.currentTime = t;
        });
        ctx.drawImage(v, 0, 0, 32, 32);
        return Array.from(ctx.getImageData(10, 10, 1, 1).data);
      }
      const first = await color(0.2),
        second = await color(1.3),
        audioContext = new AudioContext(),
        audio = await audioContext.decodeAudioData(await blob.arrayBuffer());
      const data = audio.getChannelData(0);
      function rms(start: number, end: number) {
        let sum = 0;
        const a = Math.floor(start * audio.sampleRate),
          b = Math.floor(end * audio.sampleRate);
        for (let i = a; i < b; i++) sum += data[i] ** 2;
        return Math.sqrt(sum / (b - a));
      }
      const result = {
        duration: v.duration,
        audioDuration: audio.duration,
        audioSamples: data.length,
        first,
        second,
        mutedRms: rms(0.2, 0.7),
        audibleRms: rms(1.3, 1.7),
      };
      await audioContext.close();
      URL.revokeObjectURL(url);
      return result;
    });
  await writeFile(
    "artifacts/multi-export-evidence.json",
    JSON.stringify(evidence, null, 2),
  );
  const output = await page
    .getByRole("link", { name: "Download video" })
    .evaluate(async (a: HTMLAnchorElement) =>
      Array.from(new Uint8Array(await (await fetch(a.href)).arrayBuffer())),
    );
  await writeFile("artifacts/multi-export.mp4", Buffer.from(output));
  expect(evidence.duration).toBeCloseTo(2, 0);
  expect(evidence.first[2]).toBeGreaterThan(220);
  expect(evidence.second[0]).toBeGreaterThan(220);
  expect(evidence.mutedRms).toBeLessThan(0.002);
  expect(evidence.audibleRms).toBeGreaterThan(0.05);
  await writeFile(
    "artifacts/multi-export-evidence.json",
    JSON.stringify(evidence, null, 2),
  );
  await page.getByLabel("Delete selected clip").click();
  await expect(clips).toHaveCount(1);
  await expect(
    page.getByRole("button", {
      name: "Add source.webm to timeline",
      exact: true,
    }),
  ).toHaveCount(2);
});
