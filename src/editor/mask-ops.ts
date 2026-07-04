import type { FaceBox } from "../detection/types";
import type { Point } from "./coords";

/** add = 塗った所をぼかす / protect = 塗った所はぼかさない（顔検出より優先） */
export type BrushMode = "add" | "protect";

export interface Stroke {
  mode: BrushMode;
  /** 画像ピクセル座標系でのブラシ直径 */
  size: number;
  /** 画像ピクセル座標系の軌跡 */
  points: Point[];
}

/**
 * マスクの唯一の真実。faces を基底として先に描き、strokes を順に適用する。
 * protect ストロークは描画時に destination-out で消すため、
 * 後から塗った protect が自動検出やそれ以前の add に必ず勝つ。
 */
export interface MaskState {
  faces: FaceBox[];
  strokes: Stroke[];
}

export function emptyMask(): MaskState {
  return { faces: [], strokes: [] };
}

export function setFaces(state: MaskState, faces: FaceBox[]): MaskState {
  return { ...state, faces };
}

export function pushStroke(state: MaskState, stroke: Stroke): MaskState {
  if (stroke.points.length === 0) {
    return state;
  }
  return { ...state, strokes: [...state.strokes, stroke] };
}

/** 直近のストロークを取り消す（faces 基底は維持） */
export function undo(state: MaskState): MaskState {
  if (state.strokes.length === 0) {
    return state;
  }
  return { ...state, strokes: state.strokes.slice(0, -1) };
}

export function canUndo(state: MaskState): boolean {
  return state.strokes.length > 0;
}
