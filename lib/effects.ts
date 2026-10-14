import { Clip } from "./timeline";
export const soundLibrary = [
  {
    kind: "pop" as const,
    name: "Pop",
    description: "Short, bright punctuation",
    frequency: 650,
    length: 0.16,
  },
  {
    kind: "impact" as const,
    name: "Impact",
    description: "Low hit for a cut or reveal",
    frequency: 110,
    length: 0.3,
  },
  {
    kind: "chime" as const,
    name: "Chime",
    description: "A clear success tone",
    frequency: 1100,
    length: 0.45,
  },
];
export function soundSamples(kind: string, rate = 48000) {
  const spec = soundLibrary.find((x) => x.kind === kind)!;
  return Float32Array.from(
    { length: Math.round(rate * spec.length) },
    (_, i) => {
      const t = i / rate,
        envelope = Math.min(1, t / 0.005) * Math.pow(1 - t / spec.length, 3);
      return Math.sin(2 * Math.PI * spec.frequency * t) * envelope * 0.6;
    },
  );
}
export function soundWav(kind: string) {
  const samples = soundSamples(kind),
    bytes = new Uint8Array(44 + samples.length * 2),
    view = new DataView(bytes.buffer);
  const str = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) bytes[offset + i] = s.charCodeAt(i);
  };
  str(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  str(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 48000, true);
  view.setUint32(28, 96000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) =>
    view.setInt16(44 + i * 2, Math.round(s * 32767), true),
  );
  return bytes;
}
export const activeSounds = (c: Clip) =>
  (c.sounds ?? []).filter(
    (x) => x.sourceTime >= c.sourceStart && x.sourceTime < c.sourceEnd,
  );
export function visualState(c: Clip, sourceTime: number) {
  const length = c.sourceEnd - c.sourceStart,
    t = sourceTime - c.sourceStart;
  const fade =
    c.transition?.kind === "fade"
      ? Math.min(c.transition.duration, length / 2)
      : 0;
  const opacity = fade
    ? Math.max(0, Math.min(1, t / fade, (length - t) / fade))
    : 1;
  return {
    opacity,
    scale: c.zoom && sourceTime >= c.zoom.sourceTime ? c.zoom.value : 1,
  };
}
export function dimensions(ratio: string): [number, number] {
  return ratio === "9:16"
    ? [720, 1280]
    : ratio === "1:1"
      ? [720, 720]
      : [1280, 720];
}
