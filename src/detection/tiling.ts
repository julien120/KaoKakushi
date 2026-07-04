import type { FaceBox } from "./types";

export interface Tile {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 画像を grid x grid のオーバーラップ付きタイルに分割する。
 * 全体検出で拾えない小さい顔をタイル再検出で補強するために使う。
 */
export function makeTiles(
  imageWidth: number,
  imageHeight: number,
  grid = 2,
  overlapRatio = 0.15,
): Tile[] {
  if (grid <= 1) {
    return [{ x: 0, y: 0, width: imageWidth, height: imageHeight }];
  }
  const tiles: Tile[] = [];
  const baseW = imageWidth / grid;
  const baseH = imageHeight / grid;
  const padX = baseW * overlapRatio;
  const padY = baseH * overlapRatio;
  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      const x0 = Math.max(0, col * baseW - padX);
      const y0 = Math.max(0, row * baseH - padY);
      const x1 = Math.min(imageWidth, (col + 1) * baseW + padX);
      const y1 = Math.min(imageHeight, (row + 1) * baseH + padY);
      tiles.push({
        x: Math.round(x0),
        y: Math.round(y0),
        width: Math.round(x1 - x0),
        height: Math.round(y1 - y0),
      });
    }
  }
  return tiles;
}

/** タイル内座標の検出結果を元画像座標へ戻す */
export function remapBox(box: FaceBox, tile: Tile): FaceBox {
  return { ...box, x: box.x + tile.x, y: box.y + tile.y };
}

export function iou(a: FaceBox, b: FaceBox): number {
  const ix = Math.max(
    0,
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
  );
  const iy = Math.max(
    0,
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  );
  const inter = ix * iy;
  const union = a.width * a.height + b.width * b.height - inter;
  return union <= 0 ? 0 : inter / union;
}

/**
 * NMS: スコア降順に走査し、既採用ボックスと IoU が閾値超のものを捨てる。
 * 全体検出とタイル再検出の重複をマージする。
 */
export function mergeBoxes(boxes: FaceBox[], iouThreshold = 0.45): FaceBox[] {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const kept: FaceBox[] = [];
  for (const box of sorted) {
    if (kept.every((k) => iou(k, box) <= iouThreshold)) {
      kept.push(box);
    }
  }
  return kept;
}
