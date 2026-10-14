import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOperations, Clip, duration, locate } from "../lib/timeline";
import { firstCut, presets, styleFeedback } from "../lib/styles";
import {
  activeSounds,
  soundSamples,
  soundWav,
  visualState,
} from "../lib/effects";
const clips: Clip[] = Array.from({ length: 3 }, (_, i) => ({
  id: `c${i}`,
  assetId: `a${i}`,
  sourceStart: 10,
  sourceEnd: 20,
  volume: 1,
}));
test("first cut uses all three sources, respects duration and does not invent source ranges", () => {
  const cut = firstCut(clips, presets[0], 12);
  assert.equal(duration(cut), 12);
  assert.equal(cut.length, 6);
  assert.deepEqual(
    cut.map((c) => c.assetId),
    ["a0", "a1", "a2", "a0", "a1", "a2"],
  );
  assert.ok(
    cut.every(
      (c) =>
        c.sourceStart >= 10 &&
        c.sourceEnd <= 20 &&
        activeSounds(c).length === 1,
    ),
  );
  assert.equal(duration(firstCut(clips, presets[0], 60)), 30);
  assert.throws(() => firstCut([], presets[0], 10));
  assert.throws(() => firstCut(clips, { ...presets[0], zoom: 9 }, 10));
});
test("timestamp effects follow source media through trim, split, reorder and range removal", () => {
  let cut = applyOperations(clips, [
    { type: "sound_at", time: 12, kind: "chime", volume: 0.4 },
    { type: "zoom_at", time: 15, value: 1.4 },
  ]);
  assert.equal(cut[1].sounds?.[0].sourceTime, 12);
  assert.equal(cut[1].zoom?.sourceTime, 15);
  cut = applyOperations(
    cut,
    [{ type: "split_clip", clipId: "c1", seconds: 4 }],
    () => "split",
  );
  assert.equal(activeSounds(cut[1]).length, 1);
  assert.equal(activeSounds(cut[2]).length, 0);
  cut = applyOperations(cut, [
    { type: "move_clip", clipId: "split", index: 0 },
  ]);
  assert.equal(locate(cut, 1)?.sourceTime, 15);
  assert.equal(visualState(cut[0], 15).scale, 1.4);
  cut = applyOperations(cut, [{ type: "remove_range", start: 17, end: 19 }]);
  assert.equal(duration(cut), 28);
  assert.equal(clips[1].sounds, undefined);
});
test("invalid effect operations are atomic and style learning requires an explicit call", () => {
  assert.throws(() =>
    applyOperations(clips, [
      { type: "sound_at", time: 2, kind: "pop", volume: 0.5 },
      { type: "zoom_at", time: 30, value: 1.2 },
    ]),
  );
  assert.equal(clips[0].sounds, undefined);
  assert.throws(() =>
    applyOperations(clips, [{ type: "remove_sound_at", time: 2 }]),
  );
  const preference = styleFeedback(
    presets[0],
    [{ type: "zoom_at", time: 12, value: 1.3 }],
    "More zoom",
  );
  assert.equal(preference.zoom, 1.3);
  assert.equal(presets[0].zoom, 1.15);
});
test("fade clamps to short clips and sound waveform is identical for preview and export", () => {
  const c = {
    ...clips[0],
    sourceEnd: 11,
    transition: { kind: "fade" as const, duration: 2 },
  };
  assert.equal(visualState(c, 10).opacity, 0);
  assert.equal(visualState(c, 10.5).opacity, 1);
  assert.equal(visualState(c, 11).opacity, 0);
  const wave = soundWav("chime"),
    samples = soundSamples("chime"),
    view = new DataView(wave.buffer);
  assert.equal(view.getUint32(24, true), 48000);
  assert.equal(wave.length, 44 + samples.length * 2);
  for (let i = 0; i < samples.length; i += 100)
    assert.ok(
      Math.abs(view.getInt16(44 + i * 2, true) / 32767 - samples[i]) < 0.00004,
    );
});
