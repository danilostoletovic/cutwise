import { chromium } from "@playwright/test";
import { access, mkdir, writeFile } from "node:fs/promises";
export default async function setup() {
  try {
    await access("fixtures/source.webm");
    return;
  } catch {}
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const bytes = await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 180;
      const ctx = canvas.getContext("2d")!,
        stream = canvas.captureStream(30),
        audio = new AudioContext();
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
      let frame = 0;
      const draw = () => {
        const t = (performance.now() - start) / 1000;
        ctx.fillStyle = t < 3 ? "#ff0000" : "#0000ff";
        ctx.fillRect(0, 0, 320, 180);
        ctx.fillStyle = "white";
        ctx.font = "24px monospace";
        ctx.fillText(t.toFixed(2), 200, 150);
        frame = requestAnimationFrame(draw);
      };
      draw();
      recorder.start();
      await new Promise((r) => setTimeout(r, 8000));
      await new Promise<void>((r) => {
        recorder.onstop = () => r();
        recorder.stop();
      });
      cancelAnimationFrame(frame);
      osc.stop();
      await audio.close();
      stream.getTracks().forEach((t) => t.stop());
      return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
    });
    await mkdir("fixtures", { recursive: true });
    await writeFile("fixtures/source.webm", Buffer.from(bytes));
  } finally {
    await browser.close();
  }
}
