import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { Asset, Clip, duration } from "./timeline";
export async function renderVideo(
  clips: Clip[],
  assets: Asset[],
  progress: (n: number, label: string) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  if (!clips.length) throw new Error("Add footage to the timeline first.");
  if (duration(clips) > 600) throw new Error("Alpha export limit: 10 minutes.");
  const ffmpeg = new FFmpeg();
  const cancel = () => ffmpeg.terminate();
  signal?.addEventListener("abort", cancel);
  let part = 0;
  ffmpeg.on("progress", ({ progress: p }) =>
    progress(
      Math.min(
        95,
        10 + ((part + Math.max(0, Math.min(1, p))) / clips.length) * 80,
      ),
      `Rendering clip ${part + 1} of ${clips.length}`,
    ),
  );
  try {
    progress(2, "Loading local video renderer…");
    await ffmpeg.load({
      coreURL: "/ffmpeg/ffmpeg-core.js",
      wasmURL: "/ffmpeg/ffmpeg-core.wasm",
    });
    const written = new Set<string>();
    for (let i = 0; i < clips.length; i++) {
      part = i;
      const c = clips[i],
        a = assets.find((a) => a.id === c.assetId);
      if (!a)
        throw new Error(
          "Source media is missing. Reimport it before exporting.",
        );
      const input = `input-${a.id}.${
        a.name
          .split(".")
          .at(-1)
          ?.replace(/[^a-z0-9]/gi, "") || "mp4"
      }`;
      if (!written.has(input)) {
        await ffmpeg.writeFile(input, await fetchFile(a.file));
        written.add(input);
      }
      // Every segment receives matching dimensions, frame rate and silent audio when source audio is absent.
      const args = [
        "-ss",
        String(c.sourceStart),
        "-i",
        input,
        "-f",
        "lavfi",
        "-i",
        "anullsrc=channel_layout=stereo:sample_rate=48000",
        "-t",
        String(c.sourceEnd - c.sourceStart),
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-map",
        "1:a:0",
        "-vf",
        "setpts=PTS-STARTPTS,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30",
        "-af",
        `asetpts=PTS-STARTPTS,volume=${c.volume},aresample=48000:async=1:first_pts=0,apad`,
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-ac",
        "2",
        "-ar",
        "48000",
        "-shortest",
        "-y",
        `part-${i}.mp4`,
      ];
      if ((await ffmpeg.exec(args)) !== 0)
        throw new Error(
          `Could not render ${a.name}. Its codec may not be supported by FFmpeg.`,
        );
      // Strip fallback audio if the source supplied audio: always concatenate exactly one audio stream.
      if (
        (await ffmpeg.exec([
          "-i",
          `part-${i}.mp4`,
          "-map",
          "0:v:0",
          "-map",
          "0:a:0",
          "-c",
          "copy",
          "-y",
          `clip-${i}.mp4`,
        ])) !== 0
      )
        throw new Error("Audio normalization failed.");
    }
    progress(96, "Assembling MP4…");
    await ffmpeg.writeFile(
      "sequence.txt",
      clips.map((_, i) => `file 'clip-${i}.mp4'`).join("\n"),
    );
    if (
      (await ffmpeg.exec([
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        "sequence.txt",
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        "-y",
        "shorties.mp4",
      ])) !== 0
    )
      throw new Error("Could not assemble the sequence.");
    const bytes = await ffmpeg.readFile("shorties.mp4");
    if (typeof bytes === "string" || !bytes.length)
      throw new Error("Renderer returned an empty file.");
    const blob = new Blob([new Uint8Array(bytes).buffer], {
      type: "video/mp4",
    });
    await verifyVideo(blob, duration(clips));
    progress(100, "MP4 ready to download");
    return blob;
  } finally {
    signal?.removeEventListener("abort", cancel);
    ffmpeg.terminate();
  }
}
export function verifyVideo(blob: Blob, expected: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob),
      v = document.createElement("video");
    const timer = setTimeout(
      () => done(new Error("Export playback validation timed out.")),
      20000,
    );
    function done(error?: Error) {
      clearTimeout(timer);
      v.removeAttribute("src");
      v.load();
      URL.revokeObjectURL(url);
      if (error) reject(error);
      else resolve();
    }
    v.preload = "auto";
    v.onloadeddata = () => {
      if (
        !Number.isFinite(v.duration) ||
        Math.abs(v.duration - expected) > Math.max(0.3, expected * 0.01)
      )
        done(new Error("Export duration did not match the timeline."));
      else done();
    };
    v.onerror = () =>
      done(new Error("The exported MP4 is not playable in this browser."));
    v.src = url;
  });
}
