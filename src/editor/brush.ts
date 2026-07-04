import type { Point } from "./coords";
import type { BrushMode, Stroke } from "./mask-ops";

export interface BrushHandlers {
  getMode: () => BrushMode;
  /** 画像ピクセル座標系でのブラシ直径 */
  getSizeImagePx: () => number;
  toImagePoint: (clientX: number, clientY: number) => Point;
  onPreview: (stroke: Stroke) => void;
  onCommit: (stroke: Stroke) => void;
}

/** マウス・タッチ・ペン共通の Pointer Events でブラシ入力を拾う */
export function attachBrush(
  canvas: HTMLCanvasElement,
  handlers: BrushHandlers,
): void {
  let current: Stroke | null = null;

  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    current = {
      mode: handlers.getMode(),
      size: handlers.getSizeImagePx(),
      points: [handlers.toImagePoint(e.clientX, e.clientY)],
    };
    handlers.onPreview(current);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!current) return;
    e.preventDefault();
    const coalesced =
      typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
    const events = coalesced.length > 0 ? coalesced : [e];
    for (const ev of events) {
      current.points.push(handlers.toImagePoint(ev.clientX, ev.clientY));
    }
    handlers.onPreview(current);
  });

  const finish = () => {
    if (!current) return;
    const stroke = current;
    current = null;
    handlers.onCommit(stroke);
  };
  canvas.addEventListener("pointerup", finish);
  canvas.addEventListener("pointercancel", finish);
}
