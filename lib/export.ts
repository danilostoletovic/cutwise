import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { Asset, Clip, duration } from "./timeline";
import { activeSounds, dimensions, soundWav } from "./effects";
export async function renderVideo(
  clips: Clip[],
  assets: Asset[],
  progress: (n: number, label: string) => void,
  signal?: AbortSignal,
  ratio = "16:9",
): Promise<Blob> {
  if (!clips.length) throw new Error("Add footage to the timeline first.");
  if (duration(clips) > 600) throw new Error("Alpha export limit: 10 minutes.");
  const ffmpeg = new FFmpeg();
  const [w, h] = dimensions(ratio);
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
    if (signal?.aborted) throw new Error("Export cancelled.");
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
      const length = c.sourceEnd - c.sourceStart;
      const filters = [
        `setpts=PTS-STARTPTS,scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30`,
      ];
      if (c.zoom && c.zoom.value > 1)
        filters.push(
          `zoompan=z='if(gte(on,${Math.max(0, c.zoom.sourceTime - c.sourceStart) * 30}),${c.zoom.value},1)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=${w}x${h}:fps=30`,
        );
      if (c.transition?.kind === "fade" && c.transition.duration > 0) {
        const fade = Math.min(c.transition.duration, length / 2);
        filters.push(
          `fade=t=in:st=0:d=${fade}`,
          `fade=t=out:st=${length - fade}:d=${fade}`,
        );
      }
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
        filters.join(","),
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
      if (c.title) {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.font = `600 ${Math.round(w * 0.045)}px Arial`;
        const measured = ctx.measureText(c.title).width;
        const textWidth = Math.min(measured, w * 0.85);
        ctx.fillStyle = "#141414cc";
        ctx.fillRect(
          (w - textWidth) / 2 - w * 0.025,
          h * 0.77,
          textWidth + w * 0.05,
          h * 0.12,
        );
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(c.title, w / 2, h * 0.83, w * 0.85);
        const png = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) =>
              b ? resolve(b) : reject(new Error("Title rendering failed.")),
            "image/png",
          ),
        );
        await ffmpeg.writeFile("title.png", await fetchFile(png));
        if (
          (await ffmpeg.exec([
            "-i",
            `clip-${i}.mp4`,
            "-i",
            "title.png",
            "-filter_complex",
            "[0:v][1:v]overlay=0:0[v]",
            "-map",
            "[v]",
            "-map",
            "0:a:0",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "copy",
            "-y",
            `title-${i}.mp4`,
          ])) !== 0
        )
          throw new Error("Title rendering failed.");
        await ffmpeg.deleteFile(`clip-${i}.mp4`);
        await ffmpeg.rename(`title-${i}.mp4`, `clip-${i}.mp4`);
      }
      await ffmpeg.deleteFile(`part-${i}.mp4`);
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
    let offset = 0;
    const cues = clips.flatMap((c) => {
      const list = activeSounds(c).map((x) => ({
        ...x,
        time: offset + x.sourceTime - c.sourceStart,
      }));
      offset += c.sourceEnd - c.sourceStart;
      return list;
    });
    if (cues.length) {
      progress(97, "Mixing sound effects…");
      for (const kind of new Set(cues.map((x) => x.kind)))
        await ffmpeg.writeFile(`${kind}.wav`, soundWav(kind));
      const inputs = cues.flatMap((x) => ["-i", `${x.kind}.wav`]);
      const graph =
        cues
          .map(
            (x, i) =>
              `[${i + 1}:a]volume=${x.volume},adelay=${Math.round(x.time * 1000)}:all=1[s${i}]`,
          )
          .join(";") +
        `;[0:a]${cues.map((_, i) => `[s${i}]`).join("")}amix=inputs=${cues.length + 1}:duration=first:normalize=0,alimiter=limit=0.95:level=0[a]`;
      if (
        (await ffmpeg.exec([
          "-i",
          "shorties.mp4",
          ...inputs,
          "-filter_complex",
          graph,
          "-map",
          "0:v:0",
          "-map",
          "[a]",
          "-c:v",
          "copy",
          "-c:a",
          "aac",
          "-t",
          String(duration(clips)),
          "-movflags",
          "+faststart",
          "-y",
          "mixed.mp4",
        ])) !== 0
      )
        throw new Error("Sound effect mixing failed.");
    }
    // Decode both streams with FFmpeg before browser validation, including the final mix.
    const output = cues.length ? "mixed.mp4" : "shorties.mp4";
    if (
      (await ffmpeg.exec([
        "-v",
        "error",
        "-i",
        output,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0",
        "-f",
        "null",
        "-",
      ])) !== 0
    )
      throw new Error("Export stream validation failed.");
    const bytes = await ffmpeg.readFile(output);
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
        !v.videoWidth ||
        !v.videoHeight ||
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
