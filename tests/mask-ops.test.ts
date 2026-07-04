import { describe, expect, it } from "vitest";
import {
  canUndo,
  emptyMask,
  pushStroke,
  setFaces,
  undo,
  type Stroke,
} from "../src/editor/mask-ops";

const face = { x: 10, y: 10, width: 50, height: 50, score: 0.9 };

function stroke(mode: "add" | "protect", n = 2): Stroke {
  return {
    mode,
    size: 40,
    points: Array.from({ length: n }, (_, i) => ({ x: i * 10, y: i * 10 })),
  };
}

describe("mask-ops", () => {
  it("初期状態は顔なし・ストロークなし・undo 不可", () => {
    const state = emptyMask();
    expect(state.faces).toEqual([]);
    expect(state.strokes).toEqual([]);
    expect(canUndo(state)).toBe(false);
  });

  it("setFaces は顔を差し替え、ストロークを保持する", () => {
    let state = pushStroke(emptyMask(), stroke("add"));
    state = setFaces(state, [face]);
    expect(state.faces).toEqual([face]);
    expect(state.strokes).toHaveLength(1);
  });

  it("pushStroke は順序を保って追加する", () => {
    let state = emptyMask();
    state = pushStroke(state, stroke("add"));
    state = pushStroke(state, stroke("protect"));
    expect(state.strokes.map((s) => s.mode)).toEqual(["add", "protect"]);
  });

  it("空ストロークは無視される", () => {
    const state = pushStroke(emptyMask(), {
      mode: "add",
      size: 40,
      points: [],
    });
    expect(state.strokes).toHaveLength(0);
  });

  it("undo は直近のストロークだけ取り消す", () => {
    let state = emptyMask();
    state = pushStroke(state, stroke("add"));
    state = pushStroke(state, stroke("protect"));
    state = undo(state);
    expect(state.strokes.map((s) => s.mode)).toEqual(["add"]);
  });

  it("undo しても顔基底は消えない", () => {
    let state = setFaces(emptyMask(), [face]);
    state = pushStroke(state, stroke("protect"));
    state = undo(state);
    state = undo(state); // 空でも安全
    expect(state.faces).toEqual([face]);
    expect(state.strokes).toEqual([]);
  });

  it("元の state を破壊しない（イミュータブル）", () => {
    const base = pushStroke(emptyMask(), stroke("add"));
    const next = pushStroke(base, stroke("protect"));
    undo(next);
    expect(base.strokes).toHaveLength(1);
    expect(next.strokes).toHaveLength(2);
  });
});
