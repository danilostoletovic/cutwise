import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
const fixture = resolve("fixtures/source.webm");
test("development mock planner → three clips → styles → timestamp revision → real effects MP4", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page
    .getByTestId("file-input")
    .setInputFiles([fixture, fixture, fixture]);
  const clips = page.getByTestId("timeline-clip");
  await expect(clips).toHaveCount(3);
  for (let i = 1; i <= 3; i++) {
    await page.getByLabel(`Select clip ${i}`, { exact: true }).click();
    await page.getByLabel("Mute selected clip", { exact: true }).click();
  }
  await page.getByRole("button", { name: "Styles", exact: true }).click();
  await page.getByRole("button", { name: /Minecraft Fast-Paced fast/ }).click();
  let stage = 0;
  await page.route("**/api/ai/edit", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.style.name).toContain("Minecraft");
    expect(body.media).toHaveLength(3);
    const operations =
      stage === 0
        ? [
            {
              type: "build_montage",
              targetSeconds: 6,
              clipSeconds: 2,
              zoom: 1.15,
              transition: "cut",
              transitionDuration: 0.2,
              soundIntensity: 0.35,
            },
          ]
        : stage === 1
          ? [{ type: "remove_sound_at", time: 2 }]
          : [{ type: "zoom_at", time: 3, value: 1.3 }];
    stage++;
    await route.fulfill({
      json: {
        operations,
        summary: "Development test plan",
        clarification: null,
        revision: body.revision,
      },
    });
  });
  const ask = async (text: string) => {
    await page.getByLabel("Editing command").fill(text);
    await page.getByLabel("Apply AI edit").click();
    await expect(page.getByLabel("Apply AI edit")).toBeDisabled();
  };
  await ask("Create a 6-second Minecraft montage");
  await expect(clips).toHaveCount(3);
  await expect(clips.first()).toHaveAttribute("data-source-end", "2");
  await page.getByLabel("Select clip 1", { exact: true }).click();
  await page.getByLabel("Clip transition").selectOption("fade");
  await page.getByRole("button", { name: "Titles", exact: true }).click();
  await page.getByLabel("Clip title", { exact: true }).fill("LEVEL UP");
  await page.getByLabel("Clip title", { exact: true }).press("Tab");
  await page.getByLabel("Seek sequence").fill("3.25");
  await page.getByRole("button", { name: "Sounds", exact: true }).click();
  await page.getByLabel("Search sounds").fill("Chime");
  await page.getByRole("button", { name: "Add at 00:03.25" }).click();
  await page.getByLabel("Seek to beginning").click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await ask("Remove the sound effect at 2 seconds");
  await expect(page.getByLabel("Remove pop at 2.00 seconds")).toHaveCount(0);
  await ask("Zoom in at 3 seconds to 1.3x");
  await page.getByLabel("Seek sequence").fill("3.2");
  await expect(page.getByLabel("Sequence preview")).toHaveCSS(
    "transform",
    "matrix(1.3, 0, 0, 1.3, 0, 0)",
  );
  await page.getByRole("button", { name: "Styles", exact: true }).click();
  await page.getByLabel("Style name").fill("My Minecraft recipe");
  await page
    .getByRole("button", { name: "Save last edit preference to style" })
    .click();
  await expect(
    page.getByText("Preference saved explicitly to this style."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Export MP4", exact: true }).click();
  const download = page.getByRole("link", { name: "Download video" });
  await expect(download).toBeVisible({ timeout: 120000 });
  const evidence = await download.evaluate(async (a: HTMLAnchorElement) => {
    const blob = await (await fetch(a.href)).blob(),
      url = URL.createObjectURL(blob),
      video = document.createElement("video");
    video.src = url;
    await new Promise<void>((r, j) => {
      video.onloadeddata = () => r();
      video.onerror = () => j(new Error("Unplayable export"));
    });
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext("2d")!;
    const pixel = async (t: number) => {
      await new Promise<void>((r) => {
        video.onseeked = () => r();
        video.currentTime = t;
      });
      ctx.drawImage(video, 0, 0, 1280, 720);
      return Array.from(ctx.getImageData(20, 20, 1, 1).data);
    };
    const fade = await pixel(0.05),
      full = await pixel(0.6);
    await pixel(1);
    const title = ctx.getImageData(350, 565, 580, 65).data;
    let whites = 0;
    for (let i = 0; i < title.length; i += 4)
      if (title[i] > 220 && title[i + 1] > 220 && title[i + 2] > 220) whites++;
    const context = new AudioContext(),
      audio = await context.decodeAudioData(await blob.arrayBuffer()),
      samples = audio.getChannelData(0);
    const rms = (a: number, b: number) => {
      let sum = 0;
      const start = Math.floor(a * audio.sampleRate),
        end = Math.floor(b * audio.sampleRate);
      for (let i = start; i < end; i++) sum += samples[i] ** 2;
      return Math.sqrt(sum / (end - start));
    };
    const result = {
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
      fade,
      full,
      titlePixels: whites,
      soundRms: rms(3.27, 3.4),
      silentRms: rms(2.2, 2.4),
      audioDuration: audio.duration,
      bytes: blob.size,
    };
    await context.close();
    URL.revokeObjectURL(url);
    return result;
  });
  expect(evidence.duration).toBeCloseTo(6, 1);
  expect(evidence.width).toBe(1280);
  expect(evidence.fade[0]).toBeLessThan(evidence.full[0]);
  expect(evidence.titlePixels).toBeGreaterThan(50);
  expect(evidence.soundRms).toBeGreaterThan(0.02);
  expect(evidence.silentRms).toBeLessThan(0.005);
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/upgrade-export-evidence.json",
    JSON.stringify(evidence, null, 2),
  );
  const bytes = await download.evaluate(async (a: HTMLAnchorElement) =>
    Array.from(new Uint8Array(await (await fetch(a.href)).arrayBuffer())),
  );
  await writeFile("artifacts/upgrade-export.mp4", Buffer.from(bytes));
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.reload();
  await expect(clips).toHaveCount(3);
  await page.getByRole("button", { name: "Styles", exact: true }).click();
  await page.getByRole("button", { name: /My Minecraft recipe fast/ }).click();
  await expect(page.getByLabel("Style zoom")).toHaveValue("1.3");
  await page.screenshot({
    path: "artifacts/upgrade-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1366, height: 768 });
  expect(
    await page.evaluate(() => document.querySelector("main")!.clientHeight),
  ).toBeLessThanOrEqual(768);
  await expect(page.getByLabel("Clip transition")).toBeInViewport();
  await page.getByLabel("Collapse assistant").click();
  await expect(page.getByLabel("Editing command")).toBeHidden();
  await page.getByLabel("Expand assistant").click();
  await page.screenshot({
    path: "artifacts/upgrade-laptop.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "artifacts/upgrade-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("local style assembly and canvas changes undo correctly; portrait MP4 is real", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.getByTestId("file-input").setInputFiles(fixture);
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await page.getByRole("button", { name: "Styles", exact: true }).click();
  await page.getByRole("button", { name: /Social Media Short fast/ }).click();
  await page.getByLabel("Target length").fill("1");
  await page.getByRole("button", { name: "Assemble style first cut" }).click();
  await expect(page.getByLabel("Aspect ratio")).toHaveValue("9:16");
  await page.getByLabel("Undo", { exact: true }).click();
  await expect(page.getByLabel("Aspect ratio")).toHaveValue("16:9");
  await page.getByLabel("Redo", { exact: true }).click();
  await expect(page.getByLabel("Aspect ratio")).toHaveValue("9:16");
  await page.route("**/api/ai/edit", (r) =>
    r.fulfill({
      status: 503,
      json: { error: "Development test: missing server API key" },
    }),
  );
  await page.getByLabel("Editing command").fill("Zoom at 0 seconds");
  await page.getByLabel("Apply AI edit").click();
  await expect(
    page.getByText("Development test: missing server API key"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Export MP4", exact: true }).click();
  const a = page.getByRole("link", { name: "Download video" });
  await expect(a).toBeVisible({ timeout: 120000 });
  const size = await a.evaluate(async (a: HTMLAnchorElement) => {
    const v = document.createElement("video");
    v.src = a.href;
    await new Promise<void>((r, j) => {
      v.onloadeddata = () => r();
      v.onerror = () => j(new Error("Unplayable export"));
    });
    return { width: v.videoWidth, height: v.videoHeight, duration: v.duration };
  });
  expect(size.width).toBe(720);
  expect(size.height).toBe(1280);
  expect(size.duration).toBeCloseTo(1, 1);
});
test("failed restoration never overwrites the stored project", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((r, j) => {
      const req = indexedDB.open("shorties", 1);
      req.onsuccess = () => r(req.result);
      req.onerror = () => j(req.error);
    });
    await new Promise<void>((r, j) => {
      const tx = db.transaction("project", "readwrite");
      tx.objectStore("project").put(
        { name: "Recover this project", clips: [{ id: "broken" }], assets: [] },
        "current",
      );
      tx.oncomplete = () => r();
      tx.onerror = () => j(tx.error);
    });
    db.close();
  });
  await page.reload();
  await expect(page.locator(".global-error")).toContainText(
    "Automatic saving is paused",
  );
  // Make an edit that would normally trigger autosave; saving must stay paused.
  await page.getByLabel("Project title").fill("Do not overwrite");
  await expect(page.getByText("Could not restore local project")).toBeVisible();
  const name = await page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 750));
    const db = await new Promise<IDBDatabase>((r) => {
      const req = indexedDB.open("shorties", 1);
      req.onsuccess = () => r(req.result);
    });
    const value = await new Promise<string>((r) => {
      const req = db
        .transaction("project")
        .objectStore("project")
        .get("current");
      req.onsuccess = () => r(req.result.name);
    });
    db.close();
    return value;
  });
  expect(name).toBe("Recover this project");
});
test("invalid upload, planner failures and renderer failure preserve the project", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.getByTestId("file-input").setInputFiles({
    name: "bad.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("invalid"),
  });
  await expect(page.locator(".global-error")).toContainText(
    "unsupported or damaged",
  );
  await expect(page.getByTestId("timeline-clip")).toHaveCount(0);
  await page.getByTestId("file-input").setInputFiles(fixture);
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await page.route("**/api/ai/edit", (r) =>
    r.fulfill({
      status: 502,
      json: { error: "Development test: planner unavailable" },
    }),
  );
  await page.getByLabel("Editing command").fill("Shorten the clip");
  await page.getByLabel("Apply AI edit").click();
  await expect(
    page.getByText("Development test: planner unavailable"),
  ).toBeVisible();
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await page.route("**/ffmpeg/ffmpeg-core.js", (r) => r.abort());
  await page.getByRole("button", { name: "Export MP4", exact: true }).click();
  await expect(page.locator(".global-error")).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Export MP4", exact: true }),
  ).toBeEnabled();
});
