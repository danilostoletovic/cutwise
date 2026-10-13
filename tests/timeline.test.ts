import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOperations, duration, locate, Clip } from "../lib/timeline";
import { useEditor } from "../lib/store";
const clip: Clip = {
  id: "one",
  assetId: "asset",
  sourceStart: 0,
  sourceEnd: 30,
  volume: 1,
};
test("trim and mute alter actual source bounds in one transaction", () => {
  const result = applyOperations(
    [clip],
    [
      { type: "trim_start", clipId: "one", seconds: 3 },
      { type: "set_volume", clipId: "one", value: 0 },
    ],
  );
  assert.equal(result[0].sourceStart, 3);
  assert.equal(result[0].volume, 0);
  assert.equal(duration(result), 27);
  assert.equal(locate(result, 0)?.sourceTime, 3);
  assert.equal(clip.sourceStart, 0);
});
test("invalid operation does not partially mutate source project", () => {
  assert.throws(() =>
    applyOperations(
      [clip],
      [
        { type: "set_volume", clipId: "one", value: 0 },
        { type: "trim_start", clipId: "one", seconds: 31 },
      ],
    ),
  );
  assert.equal(clip.volume, 1);
});
test("range deletion preserves source mappings across multiple clips", () => {
  const result = applyOperations(
    [clip, { ...clip, id: "two", sourceStart: 10, sourceEnd: 20 }],
    [{ type: "remove_range", start: 25, end: 35 }],
  );
  assert.deepEqual(
    result.map((c) => [c.id, c.sourceStart, c.sourceEnd]),
    [
      ["one", 0, 25],
      ["two", 15, 20],
    ],
  );
  assert.equal(locate(result, 26)?.sourceTime, 16);
});
test("internal range removal creates two editable clips", () => {
  const result = applyOperations(
    [clip],
    [{ type: "remove_range", start: 5, end: 8 }],
    () => "new",
  );
  assert.deepEqual(
    result.map((c) => [c.id, c.sourceStart, c.sourceEnd]),
    [
      ["one", 0, 5],
      ["new", 8, 30],
    ],
  );
  assert.equal(duration(result), 27);
});
test("split, reorder and delete map preview time to original media", () => {
  const result = applyOperations(
    [clip],
    [{ type: "split_clip", clipId: "one", seconds: 10 }],
    () => "two",
  );
  const reordered = applyOperations(result, [
    { type: "move_clip", clipId: "two", index: 0 },
  ]);
  assert.equal(locate(reordered, 0)?.sourceTime, 10);
  assert.equal(locate(reordered, 21)?.sourceTime, 1);
  assert.equal(
    duration(
      applyOperations(reordered, [{ type: "delete_clip", clipId: "one" }]),
    ),
    20,
  );
});
test("invalid IDs, volume, trim, range and destination are rejected", () => {
  for (const op of [
    { type: "delete_clip", clipId: "missing" },
    { type: "set_volume", clipId: "one", value: 2 },
    { type: "trim_end", clipId: "one", seconds: 30 },
    { type: "remove_range", start: 8, end: 5 },
    { type: "move_clip", clipId: "one", index: 9 },
  ])
    assert.throws(() => applyOperations([clip], [op as never]));
});
test("history restores actual timeline and rejects stale AI result", () => {
  useEditor.setState({ clips: [clip], past: [], future: [], revision: 0 });
  useEditor.getState().edit(
    [
      { type: "trim_start", clipId: "one", seconds: 2 },
      { type: "set_volume", clipId: "one", value: 0 },
    ],
    0,
  );
  assert.equal(useEditor.getState().past.length, 1);
  assert.throws(() =>
    useEditor.getState().edit([{ type: "delete_clip", clipId: "one" }], 0),
  );
  useEditor.getState().undo();
  assert.deepEqual(useEditor.getState().clips, [clip]);
  useEditor.getState().redo();
  assert.equal(useEditor.getState().clips[0].sourceStart, 2);
  assert.equal(useEditor.getState().clips[0].volume, 0);
  assert.equal(useEditor.getState().revision, 3);
});
