import { create } from "zustand";
import {
  applyOperations,
  Clip,
  Asset,
  Operation,
  duration,
  validateClips,
  describe,
} from "./timeline";
type Snapshot = { clips: Clip[]; summary: string; ratio: string };
type State = {
  name: string;
  assets: Asset[];
  clips: Clip[];
  selected: string | null;
  time: number;
  playing: boolean;
  revision: number;
  past: Snapshot[];
  future: Snapshot[];
  status: string;
  ratio: string;
  set: (s: Partial<State>) => void;
  commit: (clips: Clip[], summary: string, ratio?: string) => void;
  edit: (ops: Operation[], revision?: number) => void;
  undo: () => void;
  redo: () => void;
};
export const useEditor = create<State>((set, get) => ({
  name: "Untitled project",
  assets: [],
  clips: [],
  selected: null,
  time: 0,
  playing: false,
  revision: 0,
  past: [],
  future: [],
  status: "Ready",
  ratio: "16:9",
  set: (s) => set(s),
  commit: (clips, summary, ratio) => {
    validateClips(clips);
    const s = get();
    set({
      clips,
      ratio: ratio ?? s.ratio,
      past: [
        ...s.past.slice(-49),
        { clips: s.clips, summary: s.status, ratio: s.ratio },
      ],
      future: [],
      revision: s.revision + 1,
      status: summary,
      playing: false,
      time: Math.min(s.time, duration(clips)),
      selected: clips.some((c) => c.id === s.selected)
        ? s.selected
        : (clips[0]?.id ?? null),
    });
  },
  edit: (ops, revision) => {
    const s = get();
    if (revision !== undefined && revision !== s.revision)
      throw new Error(
        "Timeline changed while AI was working. Send the request again.",
      );
    if (!ops.length) throw new Error("No edits were requested.");
    s.commit(applyOperations(s.clips, ops), describe(ops));
  },
  undo: () => {
    const s = get(),
      prev = s.past.at(-1);
    if (!prev) return;
    set({
      clips: prev.clips,
      ratio: prev.ratio,
      past: s.past.slice(0, -1),
      future: [
        ...s.future,
        { clips: s.clips, summary: s.status, ratio: s.ratio },
      ],
      revision: s.revision + 1,
      playing: false,
      time: 0,
      selected: prev.clips[0]?.id ?? null,
      status: "Undid edit",
    });
  },
  redo: () => {
    const s = get(),
      next = s.future.at(-1);
    if (!next) return;
    set({
      clips: next.clips,
      ratio: next.ratio,
      future: s.future.slice(0, -1),
      past: [...s.past, { clips: s.clips, summary: s.status, ratio: s.ratio }],
      revision: s.revision + 1,
      playing: false,
      time: 0,
      selected: next.clips[0]?.id ?? null,
      status: "Redid edit",
    });
  },
}));
