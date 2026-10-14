import { Asset } from "./timeline";
export async function ingest(file: File): Promise<Asset> {
  if (!/\.(mp4|webm|mov|m4v)$/i.test(file.name))
    throw new Error(`${file.name}: use a browser-playable MP4 or WebM.`);
  if (file.size > 500 * 1024 * 1024)
    throw new Error("Alpha limit: 500 MB per file.");
  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const v = document.createElement("video");
      v.preload = "auto";
      v.muted = true;
      const timer = setTimeout(
        () => finish(new Error("Video metadata could not be read.")),
        20000,
      );
      function finish(error?: Error) {
        clearTimeout(timer);
        v.onloadeddata = null;
        v.onseeked = null;
        v.onerror = null;
        v.removeAttribute("src");
        v.load();
        if (error) reject(error);
      }
      v.onerror = () =>
        finish(new Error(`${file.name}: unsupported or damaged video codec.`));
      function complete() {
        if (!Number.isFinite(v.duration) || v.duration < 0.05)
          return finish(new Error("Video has no valid duration."));
        let thumbnail: string | undefined;
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 240;
          canvas.height = 135;
          canvas.getContext("2d")?.drawImage(v, 0, 0, 240, 135);
          thumbnail = canvas.toDataURL("image/jpeg", 0.7);
        } catch {}
        const asset = {
          id: crypto.randomUUID(),
          name: file.name,
          duration: v.duration,
          mimeType: file.type,
          objectUrl,
          file,
          thumbnail,
          width: v.videoWidth,
          height: v.videoHeight,
        };
        finish();
        resolve(asset);
      }
      v.onloadeddata = () => {
        if (v.duration === Infinity) {
          // Recorder-produced WebM often lacks a duration header. Seeking to
          // the end lets the browser determine the actual final timestamp.
          v.onseeked = () => {
            v.onseeked = () => complete();
            v.currentTime = 0;
          };
          v.currentTime = 1e10;
        } else complete();
      };
      v.src = objectUrl;
    });
  } catch (e) {
    URL.revokeObjectURL(objectUrl);
    throw e;
  }
}
