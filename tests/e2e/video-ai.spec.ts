import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
test("disabled providers are honest and preserve manual editing", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByText("AI video services", { exact: false }).click();
  await expect(
    page.getByRole("button", { name: "Generate with paid credits" }),
  ).toBeDisabled();
  await page.getByLabel("Provider", { exact: true }).selectOption("opusclip");
  await expect(
    page.getByText("Official API exists.", { exact: false }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/video-ai-mobile.png",
    fullPage: true,
  });
});
test("mocked provider output imports real video, deduplicates and restores metadata", async ({
  page,
}) => {
  const bytes = await readFile("fixtures/source.webm");
  let submissions = 0;
  await page.route("**/api/video-ai**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      submissions++;
      await route.fulfill({
        status: 202,
        json: { token: "mock-job", id: "mock-task" },
      });
    } else if (request.url().includes("?job=")) {
      await route.fulfill({
        json: {
          id: "mock-task",
          status: "SUCCEEDED",
          outputs: [
            {
              id: "mock-output",
              url: "http://127.0.0.1:3000/test-footage.mp4",
              name: "generated.mp4",
              metadata: { provider: "runway", taskId: "mock-task" },
            },
          ],
        },
      });
    } else
      await route.fulfill({
        json: {
          providers: [
            {
              id: "runway",
              name: "Runway",
              enabled: true,
              reason: "Mock only",
            },
          ],
        },
      });
  });
  await page.route("**/test-footage.mp4", (route) =>
    route.fulfill({ body: bytes, contentType: "video/webm" }),
  );
  await page.goto("/");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.getByText("AI video services", { exact: false }).click();
  await page
    .getByLabel("Video prompt", { exact: true })
    .fill("Original prompt");
  await page.getByLabel("Provider access code").fill("mock-code");
  await page
    .getByRole("button", { name: "Generate with paid credits" })
    .click();
  await expect(page.getByLabel("Generated footage preview")).toBeVisible();
  await page
    .getByLabel("Video prompt", { exact: true })
    .fill("Changed after submission");
  await page
    .getByRole("button", { name: "Add to library and timeline" })
    .click();
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Imported", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText("Saved on this device")).toBeVisible();
  const metadata = await page.evaluate(async () => {
    return new Promise<Record<string, unknown>>((resolve) => {
      const open = indexedDB.open("shorties", 1);
      open.onsuccess = () => {
        const db = open.result;
        const req = db
          .transaction("project")
          .objectStore("project")
          .get("current");
        req.onsuccess = () => {
          resolve(req.result.assets[0].providerMetadata);
          db.close();
        };
      };
    });
  });
  expect(metadata.prompt).toBe("Original prompt");
  expect(metadata.provider).toBe("runway");
  await page.screenshot({
    path: "artifacts/video-ai-desktop.png",
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await page.getByText("AI video services", { exact: false }).click();
  await page.getByLabel("Provider access code").fill("mock-code");
  await page.getByRole("button", { name: "Check saved job" }).click();
  await page
    .getByRole("button", { name: "Add to library and timeline" })
    .click();
  await expect(
    page.getByRole("button", { name: "Imported", exact: true }),
  ).toBeDisabled();
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  expect(submissions).toBe(1);
});
